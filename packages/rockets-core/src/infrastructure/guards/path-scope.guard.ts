import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  type PlainLiteralObject,
  Type,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ActionEnum,
  AppContextHost,
  HooksCtx,
  Operation,
} from '@concepta/nestjs-core';
import { CrudCtx, type CrudContextInterface } from '@concepta/nestjs-crud';
import {
  RepoHook,
  RepositoryInterface,
  Where,
} from '@concepta/nestjs-repository';
import type { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';
import { InjectDynamicRepository } from '../../common';
import { ActorCtx } from '../interceptors/actor.overlay';

interface RequestWithUserAndParams {
  user?: AuthorizedUser;
  params?: Record<string, unknown>;
}

/**
 * Generic guard that scopes a sub-resource by the parent's URL param.
 *
 * Auto-injected by `defineSubResource` (via `defineResource`) on EVERY
 * nested route, and it enforces two separable things:
 *
 * **Always — the addressed chain is real.**
 * 1. The parent entity exists (`404` otherwise).
 * 2. The parent is visible to the parent resource's own entity hooks —
 *    a parent hidden by a `beforeFindOne` / `afterFindOne` hook (soft
 *    expiry, tenant scope, retention) is a `404` here too. At three
 *    levels or more this is what verifies the ANCESTOR chain: the
 *    middle resource's own `PathScopeHook` is replayed on this lookup
 *    and rejects a middle row that does not belong to the addressed
 *    ancestor. Route params only ever filter by the IMMEDIATE parent, so
 *    without this a mismatched ancestor is served.
 *
 * **Only when `ownerColumn` is set — the actor owns the parent.**
 * 3. Authenticated actor (`401` otherwise).
 * 4. `ownerColumn === actor.id` (`404` — the same response as "missing"
 *    so a stranger cannot probe parent existence).
 *
 * `owner: false` / `scope: false` drop the OWNERSHIP half only. Dropping
 * the existence/chain half was never an opt-in: a request addressing a
 * row through a parent that does not contain it is malformed whoever
 * sends it.
 *
 * Sub-resources that need extra checks (e.g. body validation against a
 * lookup table) declare their own guard via `decorators: [UseGuards(X)]`.
 *
 * Bind via `PathScopeGuard.for(parentParam, parentEntityKey, ownerColumn)`.
 *
 * Why a Guard (not a Hook): Guards run before the CRUD pipeline so any
 * `HttpException` they throw propagates with the intended status. A
 * `Before*` repo hook that throws gets wrapped to a generic 500 by the
 * upstream membrane.
 *
 * Why the parent hooks are re-declared on a private context instead of
 * reusing the request's: `AppContextHost.defineOverlay` is first-write-
 * wins, and `HookContextOverlay` (an `APP_INTERCEPTOR`) has not run yet
 * when guards execute. Defining `HooksCtx` on the request here would
 * pin the PARENT's hooks onto the whole request and the sub-resource's
 * own hooks would never attach.
 *
 * What the replay context carries, and what it deliberately does not:
 *
 * - A CRUD context shaped like the parent's OWN read route —
 *   `entity: parentEntityKey`, `operation: Read`, and `params` = the
 *   request's route params with `id` bound to the parent being looked
 *   up. Without it `getCrudContext(ctx)` returns `undefined` and every
 *   hook that gates on a CRUD context — the shape this repo documents,
 *   an early return when the context is absent — silently no-ops here,
 *   including the framework's own `PathScopeHook`, which is what scopes
 *   a grandchild's parent lookup to ITS parent.
 * - The actor overlay, so owner-scoped parent hooks resolve "who".
 * - **No transaction.** Nest runs guards ahead of interceptors, so no
 *   operation transaction exists yet. The parent lookup is a pre-check,
 *   never a participant. See `CONFIGURATION.md` §5 and issue #60.
 * - **No `query`.** The guard applies no filters, sort or pagination of
 *   its own, so the parsed query is empty rather than the child route's.
 */
@Injectable()
export abstract class PathScopeGuard implements CanActivate {
  protected parentParam = '';
  protected parentEntityKey = '';
  /**
   * Owner column on the parent, or `undefined` when ownership is off.
   *
   * `abstract` on purpose: `undefined` means "no ownership check", so a
   * defaulted field would let a hand-written subclass that forgets it
   * silently serve an unguarded route. Declaring it forces the choice.
   */
  protected abstract ownerColumn: string | undefined;
  /** Primary-key column on the parent entity. Defaults to `'id'`. */
  protected parentPk = 'id';
  /** Parent resource's entity hooks, replayed for the parent lookup. */
  protected parentHooks: readonly Type[] = [];
  /** Explicit projection for the parent lookup (see `parentSelect`). */
  protected parentSelect: readonly string[] | undefined = undefined;
  /** Route param name the parent's own routes use for its primary key. */
  protected parentPrimaryParam = 'id';
  protected parentRepo!: RepositoryInterface<Record<string, unknown>>;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUserAndParams>();

    const actorId = req?.user?.id;
    // Only the ownership half needs an actor. With `owner: false` /
    // `scope: false` the route is deliberately not owner-scoped, so an
    // actor-less request still gets its chain verified rather than a 401
    // the resource never asked for.
    if (this.ownerColumn !== undefined && !actorId) {
      throw new UnauthorizedException(
        `Authenticated actor required to access ${this.parentEntityKey} sub-resource`,
      );
    }

    const paramValue = req?.params?.[this.parentParam];
    const parentId = typeof paramValue === 'string' ? paramValue : undefined;
    if (!parentId) {
      throw new NotFoundException(
        `${this.parentParam} path parameter is required`,
      );
    }

    // Only existence + ownership matter to the guard itself, so the
    // hook-free case reads the primary key alone. Once a parent hook is
    // replayed the full row is read instead: an `afterFindOne` hook may
    // inspect an expiry timestamp or a status the narrow projection
    // would omit, and nothing declares which columns a hook reads. That
    // includes eager relations — `parentSelect` on the sub-resource is
    // the opt-out for a parent whose hooks need only known columns.
    const select: readonly string[] | undefined =
      this.parentSelect ??
      (this.parentHooks.length ? undefined : [this.parentPk]);

    const ownerColumn = this.ownerColumn;
    const parent = await this.parentRepo.findOne({
      where:
        ownerColumn === undefined
          ? Where.eq<Record<string, unknown>>(this.parentPk, parentId)
          : Where.and(
              Where.eq<Record<string, unknown>>(this.parentPk, parentId),
              Where.eq<Record<string, unknown>>(ownerColumn, actorId),
            ),
      // Copied because the upstream option is a mutable `string[]` and
      // the bundle-level `parentSelect` is `readonly`.
      ...(select ? { select: [...select] } : {}),
      ctx: this.parentReadContext(actorId, req?.params ?? {}, parentId),
    });
    if (!parent) {
      throw new NotFoundException(
        `${this.parentEntityKey} ${parentId} not found`,
      );
    }

    return true;
  }

  /**
   * Static factory binding the parent param name, parent entity key, the
   * parent's owner column, the parent's primary-key column, and the
   * parent's hooks on a cached named subclass. Subclass cache keyed by
   * `(parentParam, parentEntityKey, ownerColumn, parentPk, parentHooks)`
   * so distinct bindings receive distinct provider tokens.
   */
  static for(
    parentParam: string,
    parentEntityKey: string,
    ownerColumn: string | undefined,
    parentPk: string = 'id',
    parentHooks: readonly Type[] = [],
    parentSelect?: readonly string[],
    parentPrimaryParam: string = 'id',
  ): Type<PathScopeGuard> {
    return getPathScopeGuardSubclass(
      parentParam,
      parentEntityKey,
      ownerColumn,
      parentPk,
      parentHooks,
      parentSelect,
      parentPrimaryParam,
    );
  }

  /**
   * Detached per-call context carrying the parent's hooks, the actor,
   * and a CRUD context shaped like the parent's own read route.
   * Returns `undefined` when the parent declares no hooks so the
   * hook-free path keeps its previous (context-less) behaviour.
   */
  private parentReadContext(
    actorId: string | undefined,
    routeParams: Record<string, unknown>,
    parentId: string,
  ): PlainLiteralObject | undefined {
    if (!this.parentHooks.length) return undefined;

    const host = new AppContextHost();
    host.defineOverlay(HooksCtx, {
      hooks: this.parentHooks.map((hook) => ({ hook, type: RepoHook.KEY })),
    });
    // Declared whenever the request HAS an actor, independent of
    // `ownerColumn`: that flag decides whether the GUARD filters by
    // owner, not whether the parent's own hooks get to see who is
    // asking. Omitting it on an owner-less route would silently blind
    // every actor-scoped parent hook. Only a genuinely actor-less
    // request leaves it undeclared, which is the honest "no actor" —
    // `getActor()` would otherwise report a user with no id.
    if (actorId !== undefined) {
      host.defineOverlay(ActorCtx, { id: actorId, type: 'user' });
    }

    // The parent's own primary param is overwritten rather than merged:
    // on a nested route the raw `id` is the CHILD's, and a parent hook
    // reading it means the row being filtered. It is the parent's
    // param NAME, not a hardcoded `id`, so a resource that declares a
    // different primary still sees its hooks fire. The other route
    // params are kept as they are — that is what lets a grandchild's
    // guard replay the child's `PathScopeHook` and scope by `:parentId`.
    const crudContext: CrudContextInterface = {
      entity: this.parentEntityKey,
      operation: Operation.Read,
      action: ActionEnum.READ,
      params: { ...routeParams, [this.parentPrimaryParam]: parentId },
      query: {
        fields: [],
        search: undefined,
        filter: [],
        or: [],
        sort: [],
        limit: undefined,
        offset: undefined,
        page: undefined,
        cache: undefined,
        includeDeleted: undefined,
      },
      options: {},
    };
    host.defineOverlay(CrudCtx, crudContext);

    // Materialise the overlay so `entity` / `operation` / `params` are own
    // properties on the object handed to the repository — that is the
    // shape `getCrudContext()` narrows, and the shape the CRUD pipeline
    // itself passes down.
    return host.with(CrudCtx);
  }
}

const pathScopeGuardCache = new Map<string, Type<PathScopeGuard>>();

function getPathScopeGuardSubclass(
  parentParam: string,
  parentEntityKey: string,
  ownerColumn: string | undefined,
  parentPk: string,
  parentHooks: readonly Type[],
  parentSelect: readonly string[] | undefined,
  parentPrimaryParam: string,
): Type<PathScopeGuard> {
  // JSON.stringify over the tuple, not a `::`-joined string: delimiter
  // joining collides whenever a component can contain the delimiter, and
  // nothing validates that these four never do. Hook classes are keyed
  // by their registered ids so two resources sharing a param/key/column
  // triple but different hooks still get distinct provider tokens.
  const cacheKey = JSON.stringify([
    parentParam,
    parentEntityKey,
    ownerColumn ?? null,
    parentPk,
    parentHooks.map(hookCacheId),
    parentSelect ?? null,
    parentPrimaryParam,
  ]);
  const existing = pathScopeGuardCache.get(cacheKey);
  if (existing) return existing;

  const className = `PathScopeGuard_${parentParam}_${parentEntityKey}_${
    ownerColumn ?? 'chainOnly'
  }`;
  const Subclass: Type<PathScopeGuard> = class extends PathScopeGuard {
    protected override ownerColumn: string | undefined;

    constructor(parentRepo: RepositoryInterface<Record<string, unknown>>) {
      super();
      this.parentParam = parentParam;
      this.parentEntityKey = parentEntityKey;
      this.ownerColumn = ownerColumn;
      this.parentPk = parentPk;
      this.parentHooks = parentHooks;
      this.parentSelect = parentSelect;
      this.parentPrimaryParam = parentPrimaryParam;
      this.parentRepo = parentRepo;
    }
  };
  Object.defineProperty(Subclass, 'name', { value: className });

  const inject: ParameterDecorator = InjectDynamicRepository(parentEntityKey);
  inject(Subclass, undefined, 0);
  Injectable()(Subclass);

  const ctor = Subclass;

  pathScopeGuardCache.set(cacheKey, ctor);
  return ctor;
}

// Hook classes are objects, so they cannot go through `JSON.stringify`
// directly and their `.name` is not unique (two `for()` factories can
// mint identically-named subclasses). Assign a stable per-class id the
// first time a class is seen.
const hookCacheIds = new WeakMap<Type, number>();
let nextHookCacheId = 0;

function hookCacheId(hook: Type): number {
  const existing = hookCacheIds.get(hook);
  if (existing !== undefined) return existing;
  const id = nextHookCacheId++;
  hookCacheIds.set(hook, id);
  return id;
}
