/**
 * Turn the user's `resources: [...]` list into the three lists Nest
 * actually needs at boot:
 *
 *   - **CRUD configs** — one per `CrudModule.forFeature(...)` import.
 *   - **Repository rows** — grouped by adapter, one
 *     `RepositoryModule.forFeature(...)` per group.
 *   - **Nest module slices** — one inline `DynamicModule` per
 *     `defineModuleResource()` (its controllers/providers/exports).
 *
 * Everything in this file is pure data-shaping — no Nest decorators,
 * no DI calls. The output is a plain object the module-definition file
 * spreads into the real `imports`/`providers` arrays.
 */
import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
// Maps below key on the *entity class* (the `class Foo {}` value), not a
// string. Repository registration and relation targets both use the
// class as identity, so we follow that convention here.
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import type { RocketsResourceConfig } from '../../domain/interfaces/rockets-resource.interface';
import type { CrudResource } from '../../domain/interfaces/rockets-resource-bundle.interface';
import type { ModuleResource } from '../../domain/interfaces/module-resource.interface';
import type { EntityConstructor } from '../../domain/interfaces/rockets-resource-definition.interface';
import type { RocketsUserMetadataConfig } from '../../domain/interfaces/rockets-user-metadata-config.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../rockets-core.constants';
import { resolveRelationTarget } from './relation';
import { isModuleResource } from './define-module-resource';
import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';
import { validateRocketsUserMetadataConfig } from '../user-metadata/validate-rockets-user-metadata-config';

/**
 * The plain-data result of `buildAppRegistrationPlan`. Three lists, each
 * fed into a different Nest registration call by the module-definition:
 *
 *   - `crudResources` → spread into `CrudModule.forFeature(...)` calls
 *     (one per CRUD-shaped resource the user declared).
 *   - `entityRegistrations` → spread into `RepositoryModule.forFeature(...)`
 *     calls, one per persistence adapter group (TypeORM here, Firestore
 *     there, etc).
 *   - `nestModules` → appended to `RocketsCoreModule.imports`. These are
 *     the materialised `defineModuleResource()` slices.
 */
export interface AppRegistrationPlan {
  readonly crudResources: ReadonlyArray<RocketsResourceConfig>;
  readonly entityRegistrations: ReadonlyArray<RepositoryPersistenceConfig>;
  readonly nestModules: ReadonlyArray<DynamicModule>;
}

/**
 * One entry the user can put inside `RocketsCoreModule`'s `resources: [...]`.
 *
 * The user mixes any of these freely — the planner sorts them out:
 *
 *   - `defineResource()` → generates a CRUD controller + persistence row.
 *   - `defineModuleResource()` → contributes entities and/or a Nest slice.
 *   - Plain `RocketsResourceConfig` → already-shaped CRUD config (escape hatch).
 */
export type ResourceInput<E extends PlainLiteralObject = PlainLiteralObject> =
  | CrudResource<E>
  | ModuleResource
  | RocketsResourceConfig;

/**
 * `true` when `value` was produced by `defineResource()` (carries the
 * `kind: ResourceKind.Crud` tag).
 */
export function isCrudResource(value: unknown): value is CrudResource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === ResourceKind.Crud
  );
}

/**
 * Plan everything a `RocketsCoreModule` boot needs from the user's
 * mixed `resources: [...]` array, the default `repository` adapter, and
 * the optional `userMetadata` config.
 *
 * The function is a pipeline. Each step has one job:
 *
 *   1. **Sort the input.** Walk `resources[]` and put each entry in its
 *      bucket (CRUD, module-resource, or already-shaped manual config).
 *      CRUD entries can carry sub-resources — we flatten them into peers.
 *   2. **Index the entities.** Build a `Map<EntityClass, key>` so we
 *      know every entity that exists in this app and the persistence
 *      key it claims. Used later to dedupe and to verify relations.
 *   3. **Group repository rows by adapter.** The user might have one
 *      entity on TypeORM and another on Firestore — each adapter gets
 *      its own group, which becomes one `RepositoryModule.forFeature(...)`
 *      import.
 *   4. **Verify cross-bundle relations.** If `petResource` declares a
 *      relation to `Tag`, somebody must have registered `Tag` (here or
 *      in a module-resource). Fail fast at boot if not.
 *   5. **Materialise module-resource slices.** Each `defineModuleResource()`
 *      becomes an inline `DynamicModule` with its
 *      controllers/providers/exports/imports.
 *
 * The result is plain data — the caller (module-definition) spreads it
 * into Nest's `imports`/`providers` arrays.
 *
 * @example
 * Input → output (sketch):
 *
 * ```ts
 * buildAppRegistrationPlan({
 *   resources: [petResource, authFeature],
 *   repository: TypeOrmRepositoryModule,
 *   userMetadata: { entity: UserMetadataEntity, ... },
 * })
 * // →
 * // {
 * //   crudResources:        [petResource.core],
 * //   entityRegistrations:  [{ module: TypeOrmRepositoryModule,
 * //                            entities: [
 * //                              { key: 'pet',          entity: PetEntity },
 * //                              { key: 'user',         entity: UserEntity },
 * //                              { key: 'userMetadata', entity: UserMetadataEntity },
 * //                            ] }],
 * //   nestModules:          [authFeature materialised as DynamicModule],
 * // }
 * ```
 */
export function buildAppRegistrationPlan(args: {
  readonly resources: ReadonlyArray<ResourceInput>;
  /** Default persistence adapter applied to entries without an override. */
  readonly repository?: RepositoryModuleInterface;
  readonly userMetadata?: RocketsUserMetadataConfig;
}): AppRegistrationPlan {
  // Validate user-metadata up front so a bad config fails before we
  // start building anything else.
  if (args.userMetadata) {
    validateRocketsUserMetadataConfig(args.userMetadata);
  }

  // ── Step 1 — Sort the input into three buckets ──
  //
  // CRUD bundles can carry `subResources`; we recurse into them and
  // flatten so every CRUD config ends up as a peer in `generatedResources`.
  // Anything that is neither a CRUD nor a module-resource is treated as a
  // raw manual `RocketsResourceConfig` and forwarded as-is.
  const generatedResources: CrudResource[] = [];
  const moduleBundles: ModuleResource[] = [];
  const manualResources: RocketsResourceConfig[] = [];

  const collectGenerated = (bundle: CrudResource): void => {
    generatedResources.push(bundle);
    for (const sub of bundle.subResources ?? []) {
      collectGenerated(sub);
    }
  };

  for (const definition of args.resources) {
    if (isCrudResource(definition)) {
      collectGenerated(definition);
    } else if (isModuleResource(definition)) {
      moduleBundles.push(definition);
    } else {
      manualResources.push(definition);
    }
  }

  // ── Step 2 — Index every entity class by its persistence key ──
  //
  // We need one place to ask "is `Tag` known to this app?" (relation
  // validation) and "did anyone register it twice with different keys?"
  // (conflict detection).
  const entityIndex = buildEntityIndex(
    generatedResources,
    moduleBundles,
    args.userMetadata,
  );

  // ── Step 3 — Group dynamic-repository rows per adapter ──
  //
  // The default adapter is `args.repository`; per-entity overrides go in
  // their own group. After this loop, `byAdapter` has one entry per
  // adapter the user mixed in, and each entry knows which entities live
  // under it.
  const rootAdapter = args.repository;

  // `byAdapter` maps each repository adapter to the entity classes
  // registered under it. The inner entry stores both the row and the
  // `origin` string of its registration so the duplicate error can
  // name both bundles.
  interface RegisteredRow {
    readonly row: RepositoryProviderOptions;
    readonly origin: string;
  }

  const byAdapter = new Map<
    RepositoryModuleInterface,
    Map<Type<PlainLiteralObject>, RegisteredRow>
  >();

  const addRow = (
    adapter: RepositoryModuleInterface,
    entityClass: Type<PlainLiteralObject>,
    row: RepositoryProviderOptions,
    origin: string,
  ): void => {
    const adapterMap = byAdapter.get(adapter) ?? new Map();
    const existing = adapterMap.get(entityClass);

    if (existing) {
      throwOnDuplicateEntity(entityClass.name, existing.origin, origin);
    }

    adapterMap.set(entityClass, { row, origin });
    byAdapter.set(adapter, adapterMap);
  };

  // 3a — One row per CRUD bundle. The bundle declares an adapter only
  //      when it wants to opt out of the app default; otherwise we use
  //      the root `args.repository`. When neither is set, skip the row
  //      and assume an upstream module already registers the entity.
  //      Relation validation still runs because `entityIndex` is fed
  //      independently in step 2.
  for (const resource of generatedResources) {
    const adapter = resource.persistence.module ?? rootAdapter;
    if (!adapter) continue;
    addRow(
      adapter,
      resource.persistence.entity.entity,
      resource.persistence.entity,
      `defineResource(${resource.meta.key})`,
    );
  }

  // 3b — Rows contributed by `defineModuleResource({ entities: [...] })`.
  //      Each entry chooses its adapter (per-entity override) or
  //      inherits the root one. No adapter at all = misconfiguration.
  for (const bundle of moduleBundles) {
    for (const entry of bundle.entities) {
      const adapter = entry.repository ?? rootAdapter;
      if (!adapter) {
        throw new Error(
          `buildAppRegistrationPlan: module resource entity "${entry.key}" ` +
            `(${entry.entity.name}) has no adapter — set \`extras.repository\` ` +
            `at the root or supply \`repository\` on the entity entry.`,
        );
      }
      addRow(
        adapter,
        entry.entity,
        { key: entry.key, entity: entry.entity },
        `defineModuleResource(${entry.key})`,
      );
    }
  }

  // 3c — Optional row for `userMetadata.entity`.
  //
  //      Skip the row when no adapter is reachable: that means an
  //      upstream module (typically `rockets-server-auth`) has already
  //      registered the metadata table. We still keep the class in the
  //      entity index so relations can point at it.
  if (args.userMetadata?.entity) {
    const adapter = args.userMetadata.repository ?? rootAdapter;
    if (adapter) {
      addRow(
        adapter,
        args.userMetadata.entity as Type<PlainLiteralObject>,
        {
          key: USER_METADATA_MODULE_ENTITY_KEY,
          entity: args.userMetadata.entity as Type<PlainLiteralObject>,
        },
        'extras.userMetadata',
      );
    }
  }

  // Flatten the per-adapter map into the array shape Nest expects:
  // one config per `RepositoryModule.forFeature(...)` call. The `origin`
  // tag stored alongside each row is dropped here — it only existed to
  // serve duplicate-detection messages above.
  const repositoryPersistence: RepositoryPersistenceConfig[] = Array.from(
    byAdapter.entries(),
  ).map(([module, entityMap]) => ({
    module,
    entities: Array.from(entityMap.values()).map((entry) => entry.row),
  }));

  // ── Step 4 — Verify every relation points at a known entity ──
  //
  // If `petResource` declares `relation(Tag)` but nobody registered
  // `Tag`, fail at boot with a message that says exactly which resource
  // and which relation are wrong.
  for (const resource of generatedResources) {
    for (const relation of resource.meta.relations) {
      const targetClass = resolveRelationTarget(relation);
      if (!entityIndex.has(targetClass)) {
        throw new Error(
          `buildAppRegistrationPlan[${resource.meta.key}]: relation "${relation.propertyName}" ` +
            `targets entity \`${targetClass.name}\` which is not registered in this ` +
            `RocketsModule. Either declare a \`defineResource()\` resource for it, or ` +
            `add it to a \`defineModuleResource({ entities: [...] })\` bundle.`,
        );
      }
    }
  }

  // ── Step 5 — Wrap each module-resource in an inline DynamicModule ──
  //
  // The user wrote a flat `{ controllers, providers, exports, imports }`
  // bundle; Nest expects a real `DynamicModule`. We wrap it in an
  // anonymous class so the user never has to write `@Module({...})`
  // boilerplate just to host their slice.
  const featureModules: DynamicModule[] = moduleBundles.map(
    materialiseModuleResource,
  );

  // ── Final shape ──
  //
  // CRUD configs come from two places — auto-generated by
  // `defineResource()` (we use `.core`) and any manual
  // `RocketsResourceConfig` the user passed unchanged. Both go into the
  // same list, in the same order they arrived in `resources[]`.
  const resources: RocketsResourceConfig[] = [
    ...generatedResources.map((resource) => resource.core),
    ...manualResources,
  ];

  return {
    crudResources: resources,
    entityRegistrations: repositoryPersistence,
    nestModules: featureModules,
  };
}

/**
 * Build the `entity class → persistence key` lookup used by the planner.
 *
 * Consumers:
 *
 *   - **Relation validation** — when a CRUD bundle declares
 *     `relation(Tag)`, we look up `Tag` here to confirm somebody
 *     registered it.
 *
 * Three sources feed the index, in order: CRUD bundles, module-resource
 * entities, and finally the `userMetadata.entity` (if present). The
 * same entity class showing up twice — with the same key OR a
 * different one — is always an error: the boot error names both
 * origins so the duplicate is easy to find.
 */
function buildEntityIndex(
  generatedResources: ReadonlyArray<CrudResource>,
  moduleBundles: ReadonlyArray<ModuleResource>,
  userMetadata: RocketsUserMetadataConfig | undefined,
): Map<EntityConstructor, string> {
  interface IndexEntry {
    readonly key: string;
    readonly origin: string;
  }

  const index = new Map<EntityConstructor, IndexEntry>();

  const register = (
    entityClass: EntityConstructor,
    key: string,
    origin: string,
  ): void => {
    const existing = index.get(entityClass);
    if (existing) {
      throwOnDuplicateEntity(entityClass.name, existing.origin, origin);
    }
    index.set(entityClass, { key, origin });
  };

  for (const resource of generatedResources) {
    register(
      resource.persistence.entity.entity,
      resource.meta.key,
      `defineResource(${resource.meta.key})`,
    );
  }

  for (const bundle of moduleBundles) {
    for (const entry of bundle.entities) {
      register(entry.entity, entry.key, `defineModuleResource(${entry.key})`);
    }
  }

  const userMetadataEntity = userMetadata?.entity;
  if (userMetadataEntity) {
    register(
      userMetadataEntity,
      USER_METADATA_MODULE_ENTITY_KEY,
      'extras.userMetadata',
    );
  }

  // Strip the origin tag — relation validation only needs the key.
  return new Map(
    Array.from(index.entries()).map(([entity, entry]) => [entity, entry.key]),
  );
}

/**
 * Each entity class must be registered exactly once per app. A second
 * registration — same adapter, same key, same relations or otherwise —
 * is treated as a copy-paste mistake and surfaced at boot with both
 * origins in the message so the developer can locate the duplicate.
 *
 * When two bundles legitimately want to inject the same entity, the
 * second one drops its registration and calls
 * `@InjectDynamicRepository(KEY)` from the first bundle's exports.
 */
function throwOnDuplicateEntity(
  entityName: string,
  originA: string,
  originB: string,
): never {
  throw new Error(
    `buildAppRegistrationPlan: entity \`${entityName}\` registered twice — ` +
      `first by ${originA}, then by ${originB}. Each entity class must be ` +
      `registered exactly once per app. Pick one bundle to own the entity ` +
      `and reach for it from the other via \`@InjectDynamicRepository(KEY)\`.`,
  );
}

/**
 * Wrap a `defineModuleResource()` slice in a real Nest `DynamicModule`.
 *
 * The user wrote `{ controllers, providers, exports, imports }` flat —
 * Nest needs a `DynamicModule` value. We create an anonymous class on
 * the fly so the consumer never has to declare an `@Module({...})` host
 * just to register their slice.
 */
function materialiseModuleResource(bundle: ModuleResource): DynamicModule {
  class RocketsModuleResource {}

  return {
    module: RocketsModuleResource,
    imports: bundle.imports,
    controllers: bundle.controllers,
    providers: bundle.providers ? [...bundle.providers] : undefined,
    exports: bundle.exports,
  };
}
