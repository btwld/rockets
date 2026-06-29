import { Injectable, type PlainLiteralObject, type Type } from '@nestjs/common';
import {
  type RepositoryFindOneOptions,
  type RepositoryFindOptions,
  Where,
} from '@concepta/nestjs-repository';
import { getCrudContext } from '../../utils/get-actor.helper';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
} from './entity-hook';

/**
 * Generic repository hook that scopes a sub-resource's reads/writes by
 * the parent's URL param.
 *
 * Used internally by `defineSubResource` to inject path-scope behaviour
 * without forcing the consumer to write a custom hook for every nested
 * route. Bind via {@link PathScopeHook.for}<E>(paramName, fkColumn).
 *
 * Behaviour per lifecycle:
 *
 * - `beforeFindAndCount` / `beforeFindOne` — adds `WHERE fkColumn = :param`
 *   so list/read/update/delete only see rows belonging to the parent.
 * - `beforeCreate` — stamps `payload[fkColumn] = ctx.params[paramName]`
 *   so the create payload is auto-bound to the parent indicated by the
 *   URL, even when the body omits the FK column.
 *
 * If the call is not made through the CRUD pipeline (e.g. an internal
 * repository invocation outside a request), the hook no-ops on missing
 * `params[paramName]` rather than throwing — the caller is presumed to
 * have its own scoping.
 */
@EntityHook()
@Injectable()
export class PathScopeHook<
  E extends PlainLiteralObject,
> extends PassthroughEntityHookBase<E> {
  protected readonly paramName: string = '';
  protected readonly fkColumn: string = '';

  override beforeFindAndCount(
    options: RepositoryFindOptions<E>,
    ctx?: EntityHookContext,
  ): RepositoryFindOptions<E> {
    return this.scope(options, ctx);
  }

  override beforeFindOne(
    options: RepositoryFindOneOptions<E>,
    ctx?: EntityHookContext,
  ): RepositoryFindOneOptions<E> {
    return this.scope(options, ctx);
  }

  override beforeCreate(payload: E, ctx?: EntityHookContext): E {
    const crudCtx = getCrudContext(ctx);

    // Non-HTTP path (internal repository call without a CRUD context):
    // the caller is responsible for setting the FK explicitly.
    if (!crudCtx) return payload;

    // HTTP path: URL is the only authority for the FK. Overwrite any
    // body-supplied value with the param so a spoofed body field cannot
    // escape the URL scope.
    const paramValue = crudCtx.params?.[this.paramName];
    if (typeof paramValue !== 'string' || paramValue.length === 0) {
      // Strip any body-supplied FK before throwing so a downstream
      // catch cannot accidentally persist it.
      const indexed: Record<string, unknown> = payload;
      delete indexed[this.fkColumn];
      throw new Error(
        `PathScopeHook: missing URL param "${this.paramName}" in CRUD ` +
          `context — sub-resource creates must be reached via the parent ` +
          `route so the FK can be stamped from the URL.`,
      );
    }
    (payload as Record<string, unknown>)[this.fkColumn] = paramValue;
    return payload;
  }

  /**
   * Static factory binding the entity, URL param name, and FK column on
   * a cached named subclass. The entity is mandatory because the
   * resulting subclass is decorated with `@EntityHook({ entity })` so
   * the hook resolver fences it off from foreign-entity writes — an
   * internal write to another entity from a sibling hook will not
   * re-trigger this scope. Subclass cache keyed by
   * `(entity, paramName, fkColumn)` so distinct triples receive
   * distinct provider tokens.
   */
  static for<E extends PlainLiteralObject>(
    entity: Type<E>,
    paramName: string,
    fkColumn: string,
  ): Type<PathScopeHook<E>>;
  static for(
    entity: Type<PlainLiteralObject>,
    paramName: string,
    fkColumn: string,
  ): Type<PathScopeHook<PlainLiteralObject>> {
    return getPathScopeSubclass(entity, paramName, fkColumn);
  }

  private scope<
    T extends RepositoryFindOptions<E> | RepositoryFindOneOptions<E>,
  >(options: T, ctx?: EntityHookContext): T {
    const paramValue = this.optionalParamValue(ctx);
    if (!paramValue) return options;
    const clause = Where.eq<E>(this.fkColumn as keyof E & string, paramValue);
    return {
      ...options,
      where: options.where ? Where.and(options.where, clause) : clause,
    };
  }

  private optionalParamValue(
    ctx: EntityHookContext | undefined,
  ): string | undefined {
    const crudCtx = getCrudContext(ctx);
    const value = crudCtx?.params?.[this.paramName];
    return typeof value === 'string' ? value : undefined;
  }
}

const pathScopeSubclassCache = new Map<
  Type<PlainLiteralObject>,
  Map<string, Type<PathScopeHook<PlainLiteralObject>>>
>();

function getPathScopeSubclass(
  entity: Type<PlainLiteralObject>,
  paramName: string,
  fkColumn: string,
): Type<PathScopeHook<PlainLiteralObject>> {
  const perEntity =
    pathScopeSubclassCache.get(entity) ??
    new Map<string, Type<PathScopeHook<PlainLiteralObject>>>();
  const cacheKey = `${paramName}::${fkColumn}`;
  const existing = perEntity.get(cacheKey);
  if (existing) return existing;

  const className = `PathScopeHook_${entity.name}_${paramName}_${fkColumn}`;
  const ctor = {
    [className]: class extends PathScopeHook<PlainLiteralObject> {
      protected override readonly paramName: string = paramName;
      protected override readonly fkColumn: string = fkColumn;
    },
  }[className] as Type<PathScopeHook<PlainLiteralObject>>;

  EntityHook({ entity })(ctor);
  Injectable()(ctor);

  perEntity.set(cacheKey, ctor);
  pathScopeSubclassCache.set(entity, perEntity);
  return ctor;
}
