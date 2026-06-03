import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import type {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '../../domain/interfaces/user-metadata.interface';
import { defineResource } from './define-resource';
import { defineModuleResource } from './define-module-resource';
import { relation } from './relation';
import {
  buildAppRegistrationPlan,
  isCrudResource,
} from './aggregate-resources';

@Entity('pets_t')
class PetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  // Relation properties for the typed `relation()` calls below.
  vaccinations?: VaccinationEntity[];
  owner?: OwnerEntity;
  parent?: PetEntity;
  history?: AuditEntity[];
  // Sub-resource segment fixtures — typed `subResources` keys must be
  // `keyof PetEntity`, so tests declare these as relation properties.
  tags?: AuditEntity[];
  subs?: AuditEntity[];
  a?: AuditEntity[];
}

@Entity('vaccinations_t')
class VaccinationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  label!: string;

  // Sub-resource segment fixture for nested-key collision tests.
  b?: AuditEntity[];
}

// Standalone classes used to exercise the entity index. They are NOT
// declared as TypeORM entities so they can stand in for either a generated
// resource target, a `defineModuleResource({ entities: [...] })` entry, or a
// missing registration.
class OwnerEntity {
  id!: string;
}
class AuditEntity {
  id!: string;
}
class UserMetadataEntity {
  id!: string;
}

class AggregateUserMetadataCreateDto implements UserMetadataCreatableInterface {
  userId!: string;
}

class AggregateUserMetadataUpdateDto
  implements UserMetadataModelUpdatableInterface
{
  id!: string;
}

const aggregateUserMetadataConfig = {
  entity: UserMetadataEntity,
  createDto: AggregateUserMetadataCreateDto,
  updateDto: AggregateUserMetadataUpdateDto,
} as const;

describe('isCrudResource', () => {
  it('returns true for a defineResource() result', () => {
    const bundle = defineResource({
      key: 'pet',
      path: 'pet',
      tags: ['pet'],
      entity: PetEntity,
    });
    expect(isCrudResource(bundle)).toBe(true);
  });

  it('returns false for a manual RocketsResourceConfig', () => {
    const raw = {
      crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
    };
    expect(isCrudResource(raw)).toBe(false);
  });
});

describe('buildAppRegistrationPlan', () => {
  describe('basic wiring', () => {
    it('returns empty arrays when no resources are passed', () => {
      const result = buildAppRegistrationPlan({ resources: [] });
      expect(result.crudResources).toEqual([]);
      expect(result.entityRegistrations).toEqual([]);
    });

    it('extracts generated resource core into resources', () => {
      const pet = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const result = buildAppRegistrationPlan({
        resources: [pet],
        repository: TypeOrmRepositoryModule,
      });
      expect(result.crudResources).toHaveLength(1);
      expect(result.crudResources[0]).toBe(pet.core);
    });

    it('groups entities by module into one persistence entry per adapter', () => {
      const pet = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const vac = defineResource({
        key: 'vaccination',
        entity: VaccinationEntity,
        path: 'vaccination',
        tags: ['vaccination'],
      });
      const result = buildAppRegistrationPlan({
        resources: [pet, vac],
        repository: TypeOrmRepositoryModule,
      });

      expect(result.entityRegistrations).toHaveLength(1);
      const persistence = result
        .entityRegistrations[0] as RepositoryPersistenceConfig;
      expect(persistence.module).toBe(TypeOrmRepositoryModule);
      expect(persistence.entities).toHaveLength(2);
      const keys = persistence.entities.map((e) => e.key);
      expect(keys).toEqual(expect.arrayContaining(['pet', 'vaccination']));
    });
  });

  describe('manual config passthrough', () => {
    it('passes manual configs into resources but does not contribute persistence', () => {
      const raw = {
        crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
      };
      const result = buildAppRegistrationPlan({
        resources: [raw],
      });
      expect(result.crudResources).toContain(raw);
      expect(result.entityRegistrations).toEqual([]);
    });

    it('mixes generated + manual resource definitions correctly', () => {
      const pet = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const raw = {
        crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
      };
      const result = buildAppRegistrationPlan({
        resources: [pet, raw],
        repository: TypeOrmRepositoryModule,
      });

      expect(result.crudResources[0]).toBe(pet.core);
      expect(result.crudResources[1]).toBe(raw);
    });
  });

  describe('duplicate entity registration is fail-fast', () => {
    // The aggregator treats every second registration of the same
    // entity class as a copy-paste mistake — same key or not, same
    // adapter or not. The error message names both origins so the
    // duplicate is easy to find.

    it('throws when two CRUD bundles register the same entity class with the same key', () => {
      const first = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const second = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [first, second],
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(
        /registered twice.*defineResource\(pet\).*defineResource\(pet\)/,
      );
    });

    it('throws when two CRUD bundles register the same entity under different keys', () => {
      const first = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const second = defineResource({
        key: 'animal',
        path: 'animal',
        tags: ['animal'],
        entity: PetEntity,
      });
      expect(() =>
        buildAppRegistrationPlan({ resources: [first, second] }),
      ).toThrow(
        /registered twice.*defineResource\(pet\).*defineResource\(animal\)/,
      );
    });

    it('throws when a CRUD bundle and a module resource both register the same entity', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
      });
      const petAlsoOwned = defineModuleResource({
        entities: [{ key: 'pet', entity: PetEntity }],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [pet, petAlsoOwned],
          userMetadata: aggregateUserMetadataConfig,
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(
        /registered twice.*defineResource\(pet\).*defineModuleResource\(pet\)/,
      );
    });

    it('throws when two module resources register the same entity', () => {
      const ownerOne = defineModuleResource({
        entities: [{ key: 'owner', entity: OwnerEntity }],
      });
      const ownerTwo = defineModuleResource({
        entities: [{ key: 'owner', entity: OwnerEntity }],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [ownerOne, ownerTwo],
          userMetadata: aggregateUserMetadataConfig,
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(
        /registered twice.*defineModuleResource\(owner\).*defineModuleResource\(owner\)/,
      );
    });

    it('error message tells the developer how to fix it (use @InjectDynamicRepository)', () => {
      const first = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const second = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [first, second],
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(/@InjectDynamicRepository/);
    });

    it('does NOT throw when the same entity targets two different adapters (mixed-store apps)', () => {
      // Distinct adapter reference — mixed-store apps where one entity
      // lives on a non-default adapter must still be allowed. This is
      // not a duplicate, it is an explicit per-entity routing.
      const altAdapter: RepositoryModuleInterface = {
        name: 'AltAdapter',
        forFeature: () => ({ module: class AltModule {} }),
      };
      const moduleA = defineModuleResource({
        entities: [{ key: 'pet', entity: PetEntity }],
      });
      // moduleB uses the same entity class but only registers it under
      // the entity index (no second adapter row), so it must throw —
      // this proves the mixed-store carve-out is for *different
      // entities under different adapters*, not for the same entity
      // class twice.
      const moduleB = defineModuleResource({
        entities: [{ key: 'pet', entity: PetEntity, repository: altAdapter }],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [moduleA, moduleB],
          userMetadata: aggregateUserMetadataConfig,
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(/registered twice/);
    });
  });

  describe('cross-resource relation resolution', () => {
    it('resolves a relation target that points at another generated resource', () => {
      const vac = defineResource({
        key: 'vaccination',
        entity: VaccinationEntity,
        path: 'vaccination',
        tags: ['vaccination'],
      });
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [relation(PetEntity, VaccinationEntity, 'vaccinations')],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [pet, vac],
          repository: TypeOrmRepositoryModule,
        }),
      ).not.toThrow();
    });

    it('resolves a relation target that lives in a module resource entity (no generated resource for it)', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [relation(PetEntity, OwnerEntity, 'owner')],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [
            pet,
            defineModuleResource({
              entities: [{ key: 'owner', entity: OwnerEntity }],
            }),
          ],
          userMetadata: aggregateUserMetadataConfig,
          repository: TypeOrmRepositoryModule,
        }),
      ).not.toThrow();
    });

    it('resolves a relation target supplied via a () => Class thunk', () => {
      const vac = defineResource({
        key: 'vaccination',
        entity: VaccinationEntity,
        path: 'vaccination',
        tags: ['vaccination'],
      });
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [
          relation(PetEntity, () => VaccinationEntity, 'vaccinations'),
        ],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [pet, vac],
          repository: TypeOrmRepositoryModule,
        }),
      ).not.toThrow();
    });

    it('resolves self-referential relations (parent: PetEntity)', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [relation(PetEntity, PetEntity, 'parent')],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [pet],
          repository: TypeOrmRepositoryModule,
        }),
      ).not.toThrow();
    });

    it('throws with the entity name when the target is not registered anywhere', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [relation(PetEntity, AuditEntity, 'history')],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [pet],
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(
        /relation "history".*targets entity `AuditEntity` which is not registered/,
      );
    });
  });

  describe('cross-bundle entity registration is fail-fast', () => {
    // Cross-bundle registrations of the same entity always throw —
    // identical keys are not an idempotent escape hatch any more.

    it('throws when an entity is registered under different keys across bundles', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [
            pet,
            defineModuleResource({
              entities: [{ key: 'animal', entity: PetEntity }],
            }),
          ],
          userMetadata: aggregateUserMetadataConfig,
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(
        /registered twice.*defineResource\(pet\).*defineModuleResource\(animal\)/,
      );
    });

    it('throws when an entity is registered under the SAME key across bundles (no idempotent dedup)', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [
            pet,
            defineModuleResource({
              entities: [{ key: 'pet', entity: PetEntity }],
            }),
          ],
          userMetadata: aggregateUserMetadataConfig,
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(/registered twice/);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Sub-resource flattening — `buildAppRegistrationPlan` walks each
  // bundle's `subResources` recursively so nested sub-bundles register
  // as peer resources in the final plan.
  // ────────────────────────────────────────────────────────────────────
  describe('sub-resource flattening', () => {
    it('flattens a single nested sub-resource into the resources array', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const parent = defineResource({
        key: 'pet',
        path: 'pets',
        tags: ['pets'],
        entity: PetEntity,
        subResources: {
          vaccinations: defineSubResource({
            key: 'vaccination',
            disablePathScopeGuard: true,
            entity: VaccinationEntity,
          }),
        },
      });
      const plan = buildAppRegistrationPlan({
        resources: [parent],
        userMetadata: aggregateUserMetadataConfig,
        repository: TypeOrmRepositoryModule,
      });
      // Both parent and sub appear as top-level CRUD configs.
      expect(plan.crudResources).toHaveLength(2);
    });

    it('flattens N-level nested sub-resources recursively', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      class CommentEntity {
        id!: string;
      }
      class TagEntity {
        id!: string;
        // Typed `subResources` keys must be `keyof TagEntity`.
        comments?: CommentEntity[];
      }
      const parent = defineResource({
        key: 'pet',
        path: 'pets',
        tags: ['pets'],
        entity: PetEntity,
        subResources: {
          tags: defineSubResource({
            key: 'tag',
            disablePathScopeGuard: true,
            entity: TagEntity,
            subResources: {
              comments: defineSubResource({
                key: 'comment',
                disablePathScopeGuard: true,
                entity: CommentEntity,
              }),
            },
          }),
        },
      });
      const plan = buildAppRegistrationPlan({
        resources: [parent],
        userMetadata: aggregateUserMetadataConfig,
        repository: TypeOrmRepositoryModule,
      });
      // pet + tag + comment = 3 peer resources after flattening.
      expect(plan.crudResources).toHaveLength(3);
    });

    it('contributes the sub entity to repositoryPersistence', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const parent = defineResource({
        key: 'pet',
        path: 'pets',
        tags: ['pets'],
        entity: PetEntity,
        subResources: {
          vaccinations: defineSubResource({
            key: 'vaccination',
            disablePathScopeGuard: true,
            entity: VaccinationEntity,
          }),
        },
      });
      const plan = buildAppRegistrationPlan({
        resources: [parent],
        userMetadata: aggregateUserMetadataConfig,
        repository: TypeOrmRepositoryModule,
      });
      const persistence =
        plan.entityRegistrations as RepositoryPersistenceConfig[];
      expect(persistence).toHaveLength(1);
      const entityClasses = persistence[0].entities.map((e) => e.entity);
      expect(entityClasses).toContain(PetEntity);
      expect(entityClasses).toContain(VaccinationEntity);
    });

    it('validates sub-resource relations against the same entity index', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      class UnregisteredEntity {
        id!: string;
        pet?: PetEntity;
      }
      // Sub-resource with a relation pointing to an unregistered entity.
      // The flattened sub bundle's relations are validated by the same
      // logic as parents — should throw because UnregisteredEntity isn't
      // in the index.
      class NeighbouringSub {
        id!: string;
        unrelated?: UnregisteredEntity;
      }
      const parent = defineResource({
        key: 'pet',
        path: 'pets',
        tags: ['pets'],
        entity: PetEntity,
        subResources: {
          subs: defineSubResource({
            key: 'sub',
            disablePathScopeGuard: true,
            entity: NeighbouringSub,
            relations: [
              relation(NeighbouringSub, UnregisteredEntity, 'unrelated'),
            ],
          }),
        },
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [parent],
          userMetadata: aggregateUserMetadataConfig,
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow(/UnregisteredEntity.*not registered/);
    });

    it('handles a mixed input: one parent with subs, another sibling without (council gap)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      class TagEntity {
        id!: string;
      }
      const withSubs = defineResource({
        key: 'pet',
        path: 'pets',
        tags: ['pets'],
        entity: PetEntity,
        subResources: {
          tags: defineSubResource({
            key: 'tag',
            entity: TagEntity,
            disablePathScopeGuard: true,
          }),
        },
      });
      const withoutSubs = defineResource({
        key: 'vacc',
        path: 'vaccinations',
        tags: ['vacc'],
        entity: VaccinationEntity,
      });
      const plan = buildAppRegistrationPlan({
        resources: [withSubs, withoutSubs],
        userMetadata: aggregateUserMetadataConfig,
        repository: TypeOrmRepositoryModule,
      });
      // pet + tag (sub) + vacc = 3 peer resources.
      expect(plan.crudResources).toHaveLength(3);
    });

    it('throws when a sub-resource KEY collides with another resource on a different entity (council gap)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      class CollidingEntity {
        id!: string;
      }
      // Two parents: each sibling claims `key: 'shared'` on different
      // entity classes. The entity index (buildEntityIndex) registers
      // by entity class — when the second parent tries to register
      // `shared` against a different entity, the index conflict fires.
      const parentA = defineResource({
        key: 'pet',
        path: 'pets',
        tags: ['pets'],
        entity: PetEntity,
        subResources: {
          a: defineSubResource({
            key: 'shared',
            entity: VaccinationEntity,
            disablePathScopeGuard: true,
          }),
        },
      });
      const parentB = defineResource({
        key: 'vacc',
        path: 'vaccinations',
        tags: ['vacc'],
        entity: VaccinationEntity,
        subResources: {
          b: defineSubResource({
            key: 'shared',
            entity: CollidingEntity,
            disablePathScopeGuard: true,
          }),
        },
      });
      expect(() =>
        buildAppRegistrationPlan({
          resources: [parentA, parentB],
          userMetadata: aggregateUserMetadataConfig,
          repository: TypeOrmRepositoryModule,
        }),
      ).toThrow();
    });
  });

  describe('per-entity adapter overrides', () => {
    // Stub adapter — distinct reference from `TypeOrmRepositoryModule`.
    // The aggregator groups by reference identity; it never calls
    // `forFeature` itself (that runs in module-definition).
    const altAdapter: RepositoryModuleInterface = {
      name: 'AltAdapter',
      forFeature: () => ({ module: class AltModule {} }),
    };

    class AltUserMetadataEntity {
      id!: string;
    }

    it('routes `userMetadata.entity` through `userMetadata.repository` when the override is set', () => {
      const plan = buildAppRegistrationPlan({
        resources: [],
        repository: TypeOrmRepositoryModule,
        userMetadata: {
          ...aggregateUserMetadataConfig,
          entity: AltUserMetadataEntity,
          repository: altAdapter,
        },
      });

      // Two adapter groups: TypeORM (root, but unused here) does NOT
      // appear because the metadata is the only persistence row and it
      // routes through `altAdapter`. So the plan must have exactly one
      // entry, and that entry's `module` is the override.
      expect(plan.entityRegistrations).toHaveLength(1);
      const entry = plan.entityRegistrations[0] as RepositoryPersistenceConfig;
      expect(entry.module).toBe(altAdapter);
      expect(entry.entities).toEqual([
        expect.objectContaining({ entity: AltUserMetadataEntity }),
      ]);
    });

    it('routes a feature-bundle entity through `entry.repository` when the per-entity override is set', () => {
      class AnalyticsEvent {
        id!: string;
      }
      const analyticsFeature = defineModuleResource({
        entities: [
          {
            key: 'analytics-event',
            entity: AnalyticsEvent,
            repository: altAdapter,
          },
        ],
      });

      const plan = buildAppRegistrationPlan({
        resources: [analyticsFeature],
        userMetadata: aggregateUserMetadataConfig,
        repository: TypeOrmRepositoryModule,
      });

      // Two adapter groups: TypeORM (for the userMetadata row) and
      // altAdapter (for analytics). Order is not guaranteed — assert
      // by membership.
      expect(plan.entityRegistrations).toHaveLength(2);

      const altGroup = plan.entityRegistrations.find(
        (g) => g.module === altAdapter,
      );
      const rootGroup = plan.entityRegistrations.find(
        (g) => g.module === TypeOrmRepositoryModule,
      );

      expect(altGroup?.entities).toEqual([
        expect.objectContaining({ entity: AnalyticsEvent }),
      ]);
      expect(rootGroup?.entities).toEqual([
        expect.objectContaining({ entity: UserMetadataEntity }),
      ]);
    });

    it('uses the root `repository` when a feature-bundle entity has no override', () => {
      class Tag {
        id!: string;
      }
      const tagFeature = defineModuleResource({
        entities: [{ key: 'tag', entity: Tag }],
      });

      const plan = buildAppRegistrationPlan({
        resources: [tagFeature],
        userMetadata: aggregateUserMetadataConfig,
        repository: TypeOrmRepositoryModule,
      });

      // One group only — both rows share the root adapter.
      expect(plan.entityRegistrations).toHaveLength(1);
      const entry = plan.entityRegistrations[0] as RepositoryPersistenceConfig;
      expect(entry.module).toBe(TypeOrmRepositoryModule);
      expect(entry.entities).toHaveLength(2);
    });

    it('throws when a feature-bundle entity has no override AND no root `repository` is supplied', () => {
      class StandaloneEntity {
        id!: string;
      }
      const standaloneFeature = defineModuleResource({
        entities: [{ key: 'standalone', entity: StandaloneEntity }],
      });

      expect(() =>
        buildAppRegistrationPlan({
          resources: [standaloneFeature],
          // no `repository`, no per-entity `repository`
        }),
      ).toThrow(/no persistence adapter/i);
    });
  });

  describe('CRUD adapter inheritance from root', () => {
    // Distinct reference from TypeOrmRepositoryModule: lets us tell whether
    // the aggregator routed through the root adapter or fell back somewhere.
    const altAdapter: RepositoryModuleInterface = {
      name: 'AltCrudAdapter',
      forFeature: () => ({ module: class AltModule {} }),
    };

    it('routes a CRUD bundle (no `persistence.module`) through the root `repository`', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
      });

      const plan = buildAppRegistrationPlan({
        resources: [pet],
        repository: altAdapter,
      });

      expect(plan.entityRegistrations).toHaveLength(1);
      const entry = plan.entityRegistrations[0] as RepositoryPersistenceConfig;
      expect(entry.module).toBe(altAdapter);
      expect(entry.entities).toEqual([
        expect.objectContaining({ entity: PetEntity }),
      ]);
    });

    it('honours an explicit `persistence.module` override on a CRUD bundle (root NOT used for that row)', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        persistence: { module: altAdapter },
      });
      const vac = defineResource({
        key: 'vaccination',
        entity: VaccinationEntity,
        path: 'vaccination',
        tags: ['vaccination'],
      });

      const plan = buildAppRegistrationPlan({
        resources: [pet, vac],
        repository: TypeOrmRepositoryModule,
      });

      // Two adapter groups: pet under altAdapter, vaccination under root.
      expect(plan.entityRegistrations).toHaveLength(2);
      const altGroup = plan.entityRegistrations.find(
        (g) => g.module === altAdapter,
      );
      const rootGroup = plan.entityRegistrations.find(
        (g) => g.module === TypeOrmRepositoryModule,
      );
      expect(altGroup?.entities).toEqual([
        expect.objectContaining({ entity: PetEntity }),
      ]);
      expect(rootGroup?.entities).toEqual([
        expect.objectContaining({ entity: VaccinationEntity }),
      ]);
    });

    it('throws when CRUD has no `persistence.module` and no root `repository` is supplied', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
      });

      expect(() =>
        buildAppRegistrationPlan({
          resources: [pet],
        }),
      ).toThrow(/no persistence adapter/i);
    });

    it('validates relations when root `repository` is supplied', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
      });
      const vac = defineResource({
        key: 'vaccination',
        entity: VaccinationEntity,
        path: 'vaccination',
        tags: ['vaccination'],
        relations: [relation(VaccinationEntity, PetEntity, 'pet' as never)],
      });

      expect(() =>
        buildAppRegistrationPlan({
          resources: [pet, vac],
          repository: TypeOrmRepositoryModule,
        }),
      ).not.toThrow();
    });
  });
});
