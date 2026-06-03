import type {
  DynamicModule,
  PlainLiteralObject,
  Provider,
  Type,
} from '@nestjs/common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import type { ResourceKind } from './resource-kind.enum';

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
  /** Firestore collection id when the adapter reads `collection` from provider rows. */
  readonly collection?: string;
}

/**
 * Object form for `entities[]` when you need a per-entity adapter override
 * or a custom key. `key` is optional — derived from `entity` when omitted
 * (same rule as the class shorthand).
 */
export interface ModuleResourceEntityEntryInput {
  readonly key?: string;
  readonly entity: Type<PlainLiteralObject>;
  readonly repository?: RepositoryModuleInterface;
  readonly collection?: string;
}

/**
 * Shorthand input for `entities[]`: a bare class is accepted, and the
 * key is derived from the class name (strip trailing `Entity`,
 * lowercase first char). Use `{ entity, repository? }` for adapter
 * overrides; add `key` only when you need a non-derived name.
 *
 * Examples (derived keys):
 * - `UserEntity` → `'user'`
 * - `PetTagEntity` → `'petTag'`
 * - `Order` → `'order'`
 */
export type ModuleResourceEntityInput =
  | ModuleResourceEntityEntry
  | ModuleResourceEntityEntryInput
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
