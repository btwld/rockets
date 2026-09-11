import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
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
import {
  InjectStorage,
  StorageClient,
  StorageErrorCode,
  isStorageError,
} from '@concepta/rockets-storage';

import { PetEntity } from '../pet/pet.schema';
import type { Pet } from '../pet/pet.schema';
import { PetPhotoEntity } from './pet-photo.entity';
import { PET_PHOTO_MAX_BYTES, type PetPhotoUploadBody } from './pet-photo.schema';

export const PET_PHOTOS_STORE = 'pet-photos';

/**
 * Photos as they actually work in an app: bytes in the store, a metadata
 * row in the database, and the two kept consistent by the caller.
 *
 * The object store has no transactions, so the write order matters and is
 * deliberate — upload first, THEN commit the row. A crash between the two
 * leaves an orphan object (costs storage, harms nobody); the reverse order
 * would leave a row pointing at bytes that do not exist, which every read
 * path would then have to defend against.
 */
@Injectable()
export class PetPhotoService {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly petRepo: RepositoryInterface<Pet>,
    @InjectDynamicRepository(PetPhotoEntity)
    private readonly photoRepo: RepositoryInterface<PetPhotoEntity>,
    @InjectStorage(PET_PHOTOS_STORE)
    private readonly storage: StorageClient,
    private readonly txScope: TransactionScope,
  ) {}

  async upload(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
    body: PetPhotoUploadBody,
  ): Promise<PetPhotoEntity> {
    await this.requireOwnedPet(ctx, petId, actorUserId);

    const bytes = Buffer.from(body.data, 'base64');
    if (bytes.byteLength === 0) {
      throw new BadRequestException('Image data is empty');
    }
    if (bytes.byteLength > PET_PHOTO_MAX_BYTES) {
      throw new BadRequestException(
        `Image exceeds ${PET_PHOTO_MAX_BYTES} bytes`,
      );
    }

    // The key is ours to choose and carries the tenancy: a photo of pet A
    // can never collide with one of pet B, and `prefix: pets/<id>/` lists
    // exactly one pet's objects.
    const key = `pets/${petId}/${randomUUID()}${extname(body.filename) || ''}`;
    const uploaded = await this.storage.upload(key, bytes, {
      contentType: body.contentType,
      metadata: { petId, uploadedBy: actorUserId },
    });

    try {
      return await this.txScope.run(ctx, async () =>
        this.photoRepo.create(
          {
            petId,
            storageKey: uploaded.key,
            contentType: body.contentType,
            size: bytes.byteLength,
            uploadedBy: actorUserId,
          },
          { ctx },
        ),
      );
    } catch (error) {
      // Best-effort compensation: the row never landed, so the object has
      // no owner. Failing to clean up is not worth failing the request
      // over — the upload error the caller sees is the real one.
      await this.storage.delete(uploaded.key).catch(() => undefined);
      throw error;
    }
  }

  async list(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
  ): Promise<PetPhotoEntity[]> {
    await this.requireOwnedPet(ctx, petId, actorUserId);
    return this.photoRepo.find({
      where: Where.eq<PetPhotoEntity>('petId', petId),
      ctx,
    });
  }

  async downloadUrl(
    ctx: AppContextInterface,
    petId: string,
    photoId: string,
    actorUserId: string,
    expiresIn?: number,
  ): Promise<{ url: string; expiresIn: number | null }> {
    const photo = await this.requireOwnedPhoto(ctx, petId, photoId, actorUserId);

    // A store only honors `expiresIn` when it advertises it. Asking anyway
    // is refused with NOT_SUPPORTED rather than handing back a URL that
    // silently never expires, so the caller has to decide what it wants:
    // here, fall back to the store's own default and SAY so in the
    // response rather than implying a guarantee that is not there.
    const honorsExpiry =
      this.storage.capabilities.signedDownloadPolicy?.expiresIn === true;
    const url = await this.storage.signDownload(
      photo.storageKey,
      honorsExpiry && expiresIn !== undefined ? { expiresIn } : undefined,
    );
    return { url, expiresIn: honorsExpiry ? expiresIn ?? null : null };
  }

  async read(
    ctx: AppContextInterface,
    petId: string,
    photoId: string,
    actorUserId: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const photo = await this.requireOwnedPhoto(ctx, petId, photoId, actorUserId);
    try {
      const bytes = await this.storage.downloadBytes(photo.storageKey, {
        maxBytes: PET_PHOTO_MAX_BYTES,
      });
      return { bytes, contentType: photo.contentType };
    } catch (error) {
      // The row outlived its object — someone emptied the bucket, or an
      // upload compensation half-ran. The storage error names the store,
      // operation and key, so it is worth letting it reach the log while
      // the client gets a plain 404.
      if (isStorageError(error) && error.code === StorageErrorCode.NOT_FOUND) {
        throw new NotFoundException('Photo bytes are no longer stored');
      }
      throw error;
    }
  }

  async remove(
    ctx: AppContextInterface,
    petId: string,
    photoId: string,
    actorUserId: string,
  ): Promise<void> {
    const photo = await this.requireOwnedPhoto(ctx, petId, photoId, actorUserId);

    // Row first this time, and for the same reason as upload: if the object
    // delete fails after the row is gone we leak an orphan, which is
    // cheaper than a row that claims a photo the client can never fetch.
    await this.txScope.run(ctx, async () =>
      this.photoRepo.delete(photo, { ctx }),
    );
    await this.storage.delete(photo.storageKey).catch(() => undefined);
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

  private async requireOwnedPhoto(
    ctx: AppContextInterface,
    petId: string,
    photoId: string,
    actorUserId: string,
  ): Promise<PetPhotoEntity> {
    await this.requireOwnedPet(ctx, petId, actorUserId);
    const photo = await this.photoRepo.findOne({
      where: Where.eq<PetPhotoEntity>('id', photoId),
      ctx,
    });
    if (!photo || photo.petId !== petId) {
      throw new NotFoundException('Photo not found');
    }
    return photo;
  }
}
