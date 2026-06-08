import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  Type,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import type { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';

interface RequestWithUserAndParams {
  user?: AuthorizedUser;
  params?: Record<string, unknown>;
}

/**
 * Generic guard that scopes a sub-resource by the parent's URL param.
 *
 * Auto-injected by `defineSubResource` (via `defineResource`) so every
 * nested route enforces:
 *
 * 1. Authenticated actor (`401` otherwise).
 * 2. Parent entity exists with `ownerColumn === actor.id` (`404` otherwise
 *    — same response for "missing" and "not yours" so a stranger cannot
 *    probe parent existence).
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
 */
@Injectable()
export abstract class PathScopeGuard implements CanActivate {
  protected parentParam = '';
  protected parentEntityKey = '';
  protected ownerColumn = '';
  /** Primary-key column on the parent entity. Defaults to `'id'`. */
  protected parentPk = 'id';
  protected parentRepo!: RepositoryInterface<Record<string, unknown>>;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUserAndParams>();

    const actorId = req?.user?.id;
    if (!actorId) {
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

    // Only existence + ownership matter here; pulling all parent
    // columns (and any eager relations) on every sub-resource request
    // would be wasteful. `select` narrows the read to the primary key.
    const parent = await this.parentRepo.findOne({
      where: Where.and(
        Where.eq<Record<string, unknown>>(this.parentPk, parentId),
        Where.eq<Record<string, unknown>>(this.ownerColumn, actorId),
      ),
      select: [this.parentPk],
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
   * parent's owner column, and the parent's primary-key column on a cached
   * named subclass. Subclass cache keyed by
   * `(parentParam, parentEntityKey, ownerColumn, parentPk)` so distinct
   * tuples receive distinct provider tokens.
   */
  static for(
    parentParam: string,
    parentEntityKey: string,
    ownerColumn: string,
    parentPk: string = 'id',
  ): Type<PathScopeGuard> {
    return getPathScopeGuardSubclass(
      parentParam,
      parentEntityKey,
      ownerColumn,
      parentPk,
    );
  }
}

const pathScopeGuardCache = new Map<string, Type<PathScopeGuard>>();

function getPathScopeGuardSubclass(
  parentParam: string,
  parentEntityKey: string,
  ownerColumn: string,
  parentPk: string,
): Type<PathScopeGuard> {
  const cacheKey = `${parentParam}::${parentEntityKey}::${ownerColumn}::${parentPk}`;
  const existing = pathScopeGuardCache.get(cacheKey);
  if (existing) return existing;

  const className = `PathScopeGuard_${parentParam}_${parentEntityKey}_${ownerColumn}`;
  const Subclass: Type<PathScopeGuard> = class extends PathScopeGuard {
    constructor(parentRepo: RepositoryInterface<Record<string, unknown>>) {
      super();
      this.parentParam = parentParam;
      this.parentEntityKey = parentEntityKey;
      this.ownerColumn = ownerColumn;
      this.parentPk = parentPk;
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
