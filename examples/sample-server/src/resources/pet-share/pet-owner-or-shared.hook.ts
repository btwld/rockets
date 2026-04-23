import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  BeforeFindAndCount,
  BeforeFindOne,
  InjectDynamicRepository,
  RepoHook,
  RepositoryFindOneOptions,
  RepositoryFindOptions,
  RepositoryInterface,
  Where,
  type WhereClause,
} from '@bitwild/rockets-repository';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
import { Operation } from '@concepta/nestjs-common';
import { getAuthorizedUserFromCrudContext } from '@bitwild/rockets-core';
import { PetEntity } from '../pet/pet.entity';
import { PetShareEntity } from './pet-share.entity';
import { PET_SHARE_ENTITY_KEY } from './pet-share.constants';

/**
 * Broadens pet visibility from strict "owner-only" to "owner OR shared
 * user" for read-side operations, while keeping write-side scoping
 * (update, delete) locked to the owner.
 *
 * - `BeforeFindAndCount` (list) → owner ids ∪ pet ids shared with me.
 * - `BeforeFindOne` → same broader scope when the CRUD op is `Read`;
 *   narrows back to `userId = me` when the op is `Update`/`Delete`, since
 *   those route the findOne through the adapter's pre-mutation
 *   `getOneOrFail`. A shared user reading a pet succeeds; the same user
 *   trying to update it gets a 404 at the repository layer.
 *
 * Create is untouched — the existing `PetCreateHandler` stamps
 * `userId = authUser.id` explicitly.
 */
@Injectable()
@RepoHook()
export class PetOwnerOrSharedHook {
  constructor(
    @InjectDynamicRepository(PET_SHARE_ENTITY_KEY)
    private readonly shareRepo: RepositoryInterface<PetShareEntity>,
  ) {}

  @BeforeFindAndCount()
  async scopeList(
    options: RepositoryFindOptions<PlainLiteralObject>,
    ctx?: PlainLiteralObject,
  ): Promise<RepositoryFindOptions<PlainLiteralObject>> {
    return this.applyScope(options, ctx, { writeOnly: false });
  }

  @BeforeFindOne()
  async scopeOne(
    options: RepositoryFindOneOptions<PlainLiteralObject>,
    ctx?: PlainLiteralObject,
  ): Promise<RepositoryFindOneOptions<PlainLiteralObject>> {
    const crudCtx = ctx as CrudContextInterface | undefined;
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
      | RepositoryFindOptions<PlainLiteralObject>
      | RepositoryFindOneOptions<PlainLiteralObject>,
  >(
    options: T,
    ctx: PlainLiteralObject | undefined,
    flags: { writeOnly: boolean },
  ): Promise<T> {
    const authUser = ctx
      ? getAuthorizedUserFromCrudContext(
          ctx as CrudContextInterface<PlainLiteralObject>,
        )
      : undefined;
    if (!authUser?.id) return options;

    const ownerClause = Where.eq<PetEntity>('userId', authUser.id);
    let clause: WhereClause = ownerClause;

    if (!flags.writeOnly) {
      const shares = await this.shareRepo.find({
        where: Where.eq<PetShareEntity>('userId', authUser.id),
      });
      const sharedPetIds = shares.map((s) => s.petId);
      if (sharedPetIds.length > 0) {
        clause = Where.or(
          ownerClause,
          Where.in<PetEntity>('id', sharedPetIds),
        );
      }
    }

    return {
      ...options,
      where: options.where ? Where.and(options.where, clause) : clause,
    };
  }
}
