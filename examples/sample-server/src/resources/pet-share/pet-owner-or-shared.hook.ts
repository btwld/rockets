import { Injectable } from '@nestjs/common';
import {
  InjectDynamicRepository,
  type RepositoryFindOneOptions,
  type RepositoryFindOptions,
  type RepositoryInterface,
  Where,
  type WhereClause,
} from '@bitwild/rockets-repository';
import { Operation } from '@bitwild/rockets-app';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
  getActor,
  getCrudContext,
} from '@bitwild/rockets-core';
import { PetEntity } from '../pet/pet.entity';
import { PetShareEntity } from './pet-share.entity';

/**
 * Broadens pet visibility from strict "owner-only" to "owner OR shared
 * user" for read-side operations, while keeping write-side scoping
 * (update, delete) locked to the owner.
 *
 * - `beforeFindAndCount` (list) → owner ids ∪ pet ids shared with me.
 * - `beforeFindOne` → same broader scope when the CRUD op is `Read`;
 *   narrows back to `userId = me` when the op is `Update`/`Delete`, since
 *   those route the findOne through the adapter's pre-mutation
 *   `getOneOrFail`. A shared user reading a pet succeeds; the same user
 *   trying to update it gets a 404 at the repository layer.
 *
 * Create is untouched — `OwnerStampHook` (paired on the resource) stamps
 * `userId` from the actor on every write.
 */
@EntityHook({ entity: PetEntity })
@Injectable()
export class PetOwnerOrSharedHook extends PassthroughEntityHookBase<PetEntity> {
  constructor(
    @InjectDynamicRepository(PetShareEntity)
    private readonly shareRepo: RepositoryInterface<PetShareEntity>,
  ) {
    super();
  }

  override async beforeFindAndCount(
    options: RepositoryFindOptions<PetEntity>,
    ctx?: EntityHookContext,
  ): Promise<RepositoryFindOptions<PetEntity>> {
    return this.applyScope(options, ctx, { writeOnly: false });
  }

  override async beforeFindOne(
    options: RepositoryFindOneOptions<PetEntity>,
    ctx?: EntityHookContext,
  ): Promise<RepositoryFindOneOptions<PetEntity>> {
    const crudCtx = getCrudContext(ctx);
    const writeOps = new Set<string>([
      Operation.Update,
      Operation.Replace,
      Operation.Delete,
      Operation.SoftDelete,
      Operation.Restore,
    ]);
    const writeOnly =
      crudCtx?.operation !== undefined && writeOps.has(crudCtx.operation);
    return this.applyScope(options, ctx, { writeOnly });
  }

  private async applyScope<
    T extends
      | RepositoryFindOptions<PetEntity>
      | RepositoryFindOneOptions<PetEntity>,
  >(
    options: T,
    ctx: EntityHookContext | undefined,
    flags: { writeOnly: boolean },
  ): Promise<T> {
    const actor = getActor(ctx);
    if (!actor?.id) return options;

    const ownerClause = Where.eq<PetEntity>('userId', actor.id);
    let clause: WhereClause = ownerClause;

    if (!flags.writeOnly) {
      const shares = await this.shareRepo.find({
        where: Where.eq<PetShareEntity>('userId', actor.id),
      });
      const sharedPetIds = shares.map((s) => s.petId);
      if (sharedPetIds.length > 0) {
        clause = Where.or(ownerClause, Where.in<PetEntity>('id', sharedPetIds));
      }
    }

    return {
      ...options,
      where: options.where ? Where.and(options.where, clause) : clause,
    };
  }
}
