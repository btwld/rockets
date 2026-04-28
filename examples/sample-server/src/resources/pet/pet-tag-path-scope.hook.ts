import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  AfterCreate,
  BeforeCreate,
  BeforeFindAndCount,
  BeforeFindOne,
  InjectDynamicRepository,
  RepoHook,
  RepositoryFindOneOptions,
  RepositoryFindOptions,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
import { PET_TAG_ENTITY_KEY } from './pet-tag.constants';
import { PetTagEntity } from './pet-tag.entity';

/**
 * Scopes the `petTag` junction CRUD by the `:petId` URL segment.
 *
 * This hook is the *defence in depth* layer that runs after
 * {@link PetTagPathScopeGuard}. The guard already enforces:
 *   - actor authentication
 *   - parent pet ownership
 *   - foreign-key existence on create
 * with proper `401`/`404`/`400` propagation. The hook is only
 * responsible for two purely structural concerns the guard cannot
 * do declaratively:
 *
 * 1. **Path scoping on reads** — restrict every list/get to the rows
 *    where `petId === :petId`, so a junction row that exists for a
 *    different pet can never be reached via this URL even if a
 *    consumer mis-uses `findOne` directly.
 * 2. **Stamping on create** — copy the `:petId` URL value onto the
 *    create payload before persistence. The DTO intentionally omits
 *    `petId` so the body cannot override the URL.
 *
 * Throwing `HttpException` from a `Before*` repo hook is *not* used
 * here on purpose: the upstream `Permeator` wraps any thrown error
 * into a `ModelQueryException` → `CrudQueryException` (500), which
 * masks the intended status. The guard is the right layer for any
 * authorization or validation that must surface a non-500 response.
 */
@Injectable()
@RepoHook()
export class PetTagPathScopeHook {
  constructor(
    @InjectDynamicRepository(PET_TAG_ENTITY_KEY)
    private readonly petTagRepo: RepositoryInterface<PetTagEntity>,
  ) {}

  @BeforeFindAndCount()
  async scopeList(
    options: RepositoryFindOptions<PlainLiteralObject>,
    ctx?: PlainLiteralObject,
  ): Promise<RepositoryFindOptions<PlainLiteralObject>> {
    const petId = this.optionalPetId(ctx);
    if (!petId) return options;
    return this.withPetIdClause(options, petId);
  }

  @BeforeFindOne()
  async scopeOne(
    options: RepositoryFindOneOptions<PlainLiteralObject>,
    ctx?: PlainLiteralObject,
  ): Promise<RepositoryFindOneOptions<PlainLiteralObject>> {
    const petId = this.optionalPetId(ctx);
    if (!petId) return options;
    return this.withPetIdClause(options, petId);
  }

  @BeforeCreate()
  async stampPetId<T extends PlainLiteralObject>(
    payload: T,
    ctx?: PlainLiteralObject,
  ): Promise<T> {
    const petId = this.optionalPetId(ctx);
    if (petId) {
      (payload as PlainLiteralObject).petId = petId;
    }
    return payload;
  }

  /**
   * The TypeORM `save()` call returns only the persisted columns,
   * so the eager-loaded `tag` relation declared on {@link PetTagEntity}
   * is not present on the create response. Re-fetch by primary key to
   * trigger the eager load and copy the relation onto the created
   * entity in place — the upstream `AfterCreate` membrane uses the
   * `preserve` strategy (original entity wins), so a returned object
   * would be discarded for any pre-existing keys.
   */
  @AfterCreate()
  async populateTagRelation<T extends PlainLiteralObject>(
    created: T,
  ): Promise<T> {
    const id = typeof created.id === 'string' ? created.id : undefined;
    if (!id) return created;
    const reloaded = (await this.petTagRepo.findOne({
      where: Where.eq<PetTagEntity>('id', id),
    })) as PetTagEntity | undefined;
    if (reloaded?.tag) {
      (created as PlainLiteralObject).tag = reloaded.tag;
    }
    return created;
  }

  private withPetIdClause<
    T extends
      | RepositoryFindOptions<PlainLiteralObject>
      | RepositoryFindOneOptions<PlainLiteralObject>,
  >(options: T, petId: string): T {
    const clause = Where.eq<PetTagEntity>('petId', petId);
    return {
      ...options,
      where: options.where ? Where.and(options.where, clause) : clause,
    };
  }

  /**
   * Returns the URL `:petId` if the call originated from an HTTP CRUD
   * context, otherwise `undefined` for internal repository calls (e.g.
   * the after-create reload below) so the hook does not require an
   * HTTP context to be present on every invocation.
   */
  private optionalPetId(
    ctx: PlainLiteralObject | undefined,
  ): string | undefined {
    const crudCtx = ctx as CrudContextInterface | undefined;
    return typeof crudCtx?.params?.petId === 'string'
      ? crudCtx.params.petId
      : undefined;
  }
}
