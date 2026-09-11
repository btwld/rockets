import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppContextInterface } from '@concepta/nestjs-core';
import { InjectDynamicRepository } from '@concepta/rockets-core';
import {
  RepositoryInterface,
  TransactionScope,
  Where,
} from '@concepta/nestjs-repository';
import { StorageService, type StorageObject } from '@concepta/rockets-storage';

import { PetEntity } from '../pet/pet.schema';
import type { Pet } from '../pet/pet.schema';
import { PetDocumentEntity } from './pet-document.entity';
import {
  PET_DOCUMENT_MAX_BYTES,
  type PetDocumentUploadBody,
} from './pet-document.schema';

export const PET_DOCUMENTS_STORE = 'pet-documents';
export const PET_ARCHIVE_STORE = 'pet-archive';

/**
 * Two stores, one workflow: live documents in `pet-documents`, cold ones
 * moved to `pet-archive`. Injects `StorageService` rather than a single
 * client because the store is a runtime decision here — `use(name)` is the
 * seam an app needs the moment it has more than one bucket.
 */
@Injectable()
export class PetDocumentService {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly petRepo: RepositoryInterface<Pet>,
    @InjectDynamicRepository(PetDocumentEntity)
    private readonly docRepo: RepositoryInterface<PetDocumentEntity>,
    private readonly storage: StorageService,
    private readonly txScope: TransactionScope,
  ) {}

  async upload(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
    body: PetDocumentUploadBody,
  ): Promise<PetDocumentEntity> {
    await this.requireOwnedPet(ctx, petId, actorUserId);

    const bytes = Buffer.from(body.data, 'base64');
    if (bytes.byteLength === 0 || bytes.byteLength > PET_DOCUMENT_MAX_BYTES) {
      throw new BadRequestException('Document must be 1 byte to 8 MB');
    }

    const key = `pets/${petId}/${randomUUID()}`;
    // Streamed on the way in: a document is big enough that holding a
    // second copy in memory for the driver is pointless.
    const uploaded = await this.storage.use(PET_DOCUMENTS_STORE).upload(
      key,
      Readable.from(bytes),
      { contentType: body.contentType },
    );

    try {
      return await this.txScope.run(ctx, async () =>
        this.docRepo.create(
          {
            petId,
            title: body.title,
            storageKey: uploaded.key,
            contentType: body.contentType,
            size: bytes.byteLength,
            store: PET_DOCUMENTS_STORE,
          },
          { ctx },
        ),
      );
    } catch (error) {
      await this.storage
        .use(PET_DOCUMENTS_STORE)
        .delete(uploaded.key)
        .catch(() => undefined);
      throw error;
    }
  }

  async list(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
  ): Promise<PetDocumentEntity[]> {
    await this.requireOwnedPet(ctx, petId, actorUserId);
    return this.docRepo.find({
      where: Where.eq<PetDocumentEntity>('petId', petId),
      ctx,
    });
  }

  /**
   * Streams the object, optionally a byte range. The range is what makes a
   * PDF viewer able to jump to page 40 without pulling the whole file, so
   * the store has to actually support it — `rangeRead` says whether it does.
   */
  async open(
    ctx: AppContextInterface,
    petId: string,
    documentId: string,
    actorUserId: string,
    range?: { start: number; end?: number },
  ): Promise<{ object: StorageObject; document: PetDocumentEntity }> {
    const document = await this.requireOwnedDocument(
      ctx,
      petId,
      documentId,
      actorUserId,
    );
    const client = this.storage.use(document.store);
    if (range && !client.capabilities.rangeRead) {
      throw new BadRequestException(
        `Store "${document.store}" cannot serve byte ranges`,
      );
    }
    const object = await client.downloadStream(document.storageKey, {
      ...(range !== undefined && { range }),
    });
    return { object, document };
  }

  /**
   * Move every live document of a pet to the archive store, then point the
   * rows at it. `transfer` streams object by object and reports what it
   * skipped, so a re-run is cheap rather than a re-upload.
   */
  async archive(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
  ): Promise<{ archived: string[]; skipped: string[] }> {
    await this.requireOwnedPet(ctx, petId, actorUserId);
    const live = await this.docRepo.find({
      where: Where.and(
        Where.eq<PetDocumentEntity>('petId', petId),
        Where.eq<PetDocumentEntity>('store', PET_DOCUMENTS_STORE),
      ),
      ctx,
    });
    if (live.length === 0) {
      return { archived: [], skipped: [] };
    }

    const result = await this.storage.transfer({
      from: PET_DOCUMENTS_STORE,
      to: PET_ARCHIVE_STORE,
      prefix: `pets/${petId}/`,
      overwrite: false,
    });

    const moved = new Set(result.transferred);
    const skipped = result.skipped ?? [];
    await this.txScope.run(ctx, async () => {
      for (const document of live) {
        if (!moved.has(document.storageKey) && !skipped.includes(document.storageKey)) {
          continue;
        }
        await this.docRepo.update(
          document,
          { store: PET_ARCHIVE_STORE },
          { ctx },
        );
      }
    });

    // Only now drop the originals: the rows already point at the archive,
    // so a failure here leaves duplicates, never a dangling reference.
    await this.storage
      .use(PET_DOCUMENTS_STORE)
      .deleteMany([...moved, ...skipped])
      .catch(() => undefined);

    return { archived: [...moved], skipped: [...skipped] };
  }

  async removeAllForPet(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
  ): Promise<number> {
    await this.requireOwnedPet(ctx, petId, actorUserId);
    const documents = await this.docRepo.find({
      where: Where.eq<PetDocumentEntity>('petId', petId),
      ctx,
    });
    if (documents.length === 0) return 0;

    await this.txScope.run(ctx, async () =>
      this.docRepo.deleteMany(documents, { ctx }),
    );

    // One bulk call per store rather than a loop of deletes — the bulk API
    // reports per-key errors instead of aborting on the first miss.
    for (const store of new Set(documents.map((d) => d.store))) {
      const keys = documents
        .filter((d) => d.store === store)
        .map((d) => d.storageKey);
      await this.storage.use(store).deleteMany(keys).catch(() => undefined);
    }
    return documents.length;
  }

  private async requireOwnedPet(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
  ): Promise<Pet> {
    const pet = await this.petRepo.findOne({
      where: Where.eq<Pet>('id', petId),
      ctx,
    });
    if (!pet || pet.userId !== actorUserId) {
      throw new NotFoundException('Pet not found or not owned by you');
    }
    return pet;
  }

  private async requireOwnedDocument(
    ctx: AppContextInterface,
    petId: string,
    documentId: string,
    actorUserId: string,
  ): Promise<PetDocumentEntity> {
    await this.requireOwnedPet(ctx, petId, actorUserId);
    const document = await this.docRepo.findOne({
      where: Where.eq<PetDocumentEntity>('id', documentId),
      ctx,
    });
    if (!document || document.petId !== petId) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }
}
