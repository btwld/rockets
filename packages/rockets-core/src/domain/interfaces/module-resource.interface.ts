import type {
  DynamicModule,
  PlainLiteralObject,
  Provider,
  Type,
} from '@nestjs/common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import { deriveEntityKey, resolveEntityKey } from '@bitwild/rockets-common';
import type { ResourceKind } from './resource-kind.enum';

export { deriveEntityKey };

/**
 * One persistence row contributed by a module resource.
 *
 * Each entry produces a single `@InjectDynamicRepository(key)` token and
 * is registered with the effective adapter
 * (`entry.repository ?? root.repository`). Per-entity `repository` is the
 * single way to opt one specific table out of the application default
 * (e.g. one feature stores audit rows in Firestore while the rest of the
 * app uses TypeORM).
 */
export interface ModuleResourceEntityEntry {
  readonly key: string;
  readonly entity: Type<PlainLiteralObject>;
  /** Override the root adapter for this entity only. Defaults to the root `repository`. */
  readonly repository?: RepositoryModuleInterface;
}

/**
 * Shorthand input for `entities[]`: a bare class is accepted, and the
 * key is derived from the class name (strip trailing `Entity`,
 * lowercase first char). Use the explicit `{ key, entity, repository? }`
 * form when you need a custom key or per-entity adapter override.
 *
 * Examples (derived keys):
 * - `UserEntity` → `'user'`
 * - `PetTagEntity` → `'petTag'`
 * - `Order` → `'order'`
 */
export type ModuleResourceEntityInput =
  | ModuleResourceEntityEntry
  | Type<PlainLiteralObject>;

/**
 * The object returned by `defineModuleResource()`.
 *
 * A module resource declares **two things at once**:
 *  1. Optional dynamic-repository registrations (`entities[]`) that other
 *     resources inside the same Rockets app can `@InjectDynamicRepository`
 *     by key — folded into the same `RepositoryModule.forFeature` plan as
 *     `defineResource()` resources.
 *  2. A flat Nest module slice (controllers / providers / exports / imports)
 *     appended to `RocketsCoreModule`'s own imports so the resource is
 *     wired without an extra `XModule` in `AppModule.imports`.
 *
 * `entities` is allowed to be empty: a resource can be pure Nest wiring
 * (e.g. a CQRS-only workflow that depends on repos already registered by
 * another resource), in which case it only contributes a `DynamicModule` to
 * the resource plan.
 */
export interface ModuleResource {
  readonly kind: ResourceKind.Module;
  /** Dynamic-repository rows owned by this resource (may be empty). */
  readonly entities: ReadonlyArray<ModuleResourceEntityEntry>;
  readonly imports?: NonNullable<DynamicModule['imports']>;
  readonly controllers?: NonNullable<DynamicModule['controllers']>;
  readonly providers?: ReadonlyArray<Provider>;
  readonly exports?: NonNullable<DynamicModule['exports']>;
}

/**
 * Normalise a class shorthand or full entry into the canonical
 * `ModuleResourceEntityEntry` shape.
 *
 * @example
 * Input → output:
 *
 * ```ts
 * // Class shorthand → derives the key
 * normaliseModuleResourceEntity(UserEntity)
 * // → { key: 'user', entity: UserEntity }
 *
 * // Full entry → passes through unchanged
 * normaliseModuleResourceEntity({ key: 'audit', entity: AuditEntity })
 * // → { key: 'audit', entity: AuditEntity }
 *
 * // Full entry with adapter override → preserved
 * normaliseModuleResourceEntity({
 *   key: 'analytics',
 *   entity: AnalyticsEntity,
 *   repository: FirestoreRepositoryModule,
 * })
 * // → { key: 'analytics', entity: AnalyticsEntity, repository: FirestoreRepositoryModule }
 * ```
 */
export function normaliseModuleResourceEntity(
  input: ModuleResourceEntityInput,
): ModuleResourceEntityEntry {
  if (typeof input === 'function') {
    return { key: resolveEntityKey(input), entity: input };
  }
  return input;
}
