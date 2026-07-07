import { Injectable, NotFoundException } from '@nestjs/common';
import type { AppContextInterface } from '@concepta/nestjs-core';
import { RepositoryInterface, TransactionScope, Where } from '@concepta/nestjs-repository';
import { PetEntity } from '../resources/pet/pet.schema';
import type { Pet } from '../resources/pet/pet.schema';
import { InjectDynamicRepository } from '@bitwild/rockets-core';

export interface ListParams {
  readonly withDeleted: boolean;
  readonly limit: number;
  readonly offset: number;
}

export interface ListResult {
  readonly data: Pet[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Bypasses the per-user ownership scope used by the `/pets` CRUD. Only
 * the `AdminGuard`-gated controller calls this service. Mutating methods
 * wrap the find + write pair in `txScope.run` so the admin can't act on
 * a stale row after a concurrent change.
 */
@Injectable()
export class AdminPetService {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly petRepo: RepositoryInterface<Pet>,
    private readonly txScope: TransactionScope,
  ) {}

  async list(
    ctx: AppContextInterface,
    params: ListParams,
  ): Promise<ListResult> {
    const [data, total] = await this.petRepo.findAndCount({
      withDeleted: params.withDeleted,
      take: params.limit,
      skip: params.offset,
      ctx,
    });
    return { data, total, limit: params.limit, offset: params.offset };
  }

  async read(
    ctx: AppContextInterface,
    id: string,
    withDeleted: boolean,
  ): Promise<Pet> {
    const pet = await this.petRepo.findOne({
      where: Where.eq<Pet>('id', id),
      withDeleted,
      ctx,
    });
    if (!pet) throw new NotFoundException(`Pet ${id} not found`);
    return pet;
  }

  async forceRestore(ctx: AppContextInterface, id: string): Promise<Pet> {
    return this.txScope.run(ctx, async () => {
      const pet = await this.petRepo.findOne({
        where: Where.eq<Pet>('id', id),
        withDeleted: true,
        ctx,
      });
      if (!pet) throw new NotFoundException(`Pet ${id} not found`);
      return this.petRepo.restore(pet, { ctx });
    });
  }

  async hardDelete(ctx: AppContextInterface, id: string): Promise<void> {
    await this.txScope.run(ctx, async () => {
      const pet = await this.petRepo.findOne({
        where: Where.eq<Pet>('id', id),
        withDeleted: true,
        ctx,
      });
      if (!pet) throw new NotFoundException(`Pet ${id} not found`);
      await this.petRepo.delete(pet, { ctx });
    });
  }
}
