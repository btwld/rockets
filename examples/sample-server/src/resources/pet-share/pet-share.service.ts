import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppContextInterface } from '@concepta/nestjs-core';
import { RepositoryInterface, TransactionScope, Where } from '@concepta/nestjs-repository';
import { PetEntity } from '../pet/pet.schema';
import type { Pet } from '../pet/pet.schema';
import { PetShareEntity, PetSharePermission } from './pet-share.entity';
import { InjectDynamicRepository } from '@bitwild/rockets-core';

export interface ShareCreateInput {
  readonly petId: string;
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly permission?: PetSharePermission;
}

/**
 * Application-layer service for pet-share.
 *
 * Follows the repo's persistence pattern without CQRS: methods take
 * `ctx` from the HTTP boundary (`@Ctx()`), wrap multi-step work in
 * `txScope.run(ctx, ...)` which mutates the same `AppContextHost` with
 * a `TrxCtx` overlay, and forward `{ctx}` to every repository call so
 * they join the active transaction.
 *
 * Same `ctx` is used inside and outside the `run` callback — upstream
 * `SignupUserHandler` does the same. The optional `txCtx` callback
 * param is only useful when you want the `trx` manager directly
 * (onCommit/onRollback hooks).
 */
@Injectable()
export class PetShareService {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly petRepo: RepositoryInterface<Pet>,
    @InjectDynamicRepository(PetShareEntity)
    private readonly shareRepo: RepositoryInterface<PetShareEntity>,
    private readonly txScope: TransactionScope,
  ) {}

  async share(
    ctx: AppContextInterface,
    input: ShareCreateInput,
  ): Promise<PetShareEntity> {
    if (input.targetUserId === input.actorUserId) {
      throw new BadRequestException('Cannot share a pet with yourself');
    }

    return this.txScope.run(ctx, async () => {
      await this.requireOwnedPet(ctx, input.petId, input.actorUserId);
      return this.shareRepo.create(
        {
          petId: input.petId,
          userId: input.targetUserId,
          permission: input.permission ?? PetSharePermission.READ,
        },
        { ctx },
      );
    });
  }

  async listForPet(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
  ): Promise<PetShareEntity[]> {
    return this.txScope.run(ctx, async () => {
      await this.requireOwnedPet(ctx, petId, actorUserId);
      return this.shareRepo.find({
        where: Where.eq<PetShareEntity>('petId', petId),
        ctx,
      });
    });
  }

  async revoke(
    ctx: AppContextInterface,
    petId: string,
    targetUserId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.txScope.run(ctx, async () => {
      await this.requireOwnedPet(ctx, petId, actorUserId);

      const share = await this.shareRepo.findOne({
        where: Where.and(
          Where.eq<PetShareEntity>('petId', petId),
          Where.eq<PetShareEntity>('userId', targetUserId),
        ),
        ctx,
      });
      if (!share) {
        throw new NotFoundException(
          `Share for pet ${petId} with user ${targetUserId} not found`,
        );
      }
      await this.shareRepo.delete(share, { ctx });
    });
  }

  // Collapses "not yours" and "not found" into a single 404 so the API
  // never leaks pet existence to non-owners.
  private async requireOwnedPet(
    ctx: AppContextInterface,
    petId: string,
    actorUserId: string,
  ): Promise<Pet> {
    const pet = await this.petRepo.findOne({
      where: Where.and(
        Where.eq<Pet>('id', petId),
        Where.eq<Pet>('userId', actorUserId),
      ),
      ctx,
    });
    if (!pet) {
      throw new NotFoundException(`Pet ${petId} not found`);
    }
    return pet;
  }
}
