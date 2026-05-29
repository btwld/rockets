import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type { RepositoryBootstrap } from '@bitwild/rockets-core';
import type {
  DynamicRepositoryModule,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';

/**
 * Returns a `RepositoryBootstrap` that:
 * - Forwards `forFeature(entities)` to upstream `TypeOrmRepositoryModule`.
 * - Implements `forRoot(entities)` by wrapping `TypeOrmModule.forRoot`
 *   with the connection options the caller passed in plus the entity set
 *   the Rockets planner derived from `resources[]`, `userMetadata`, and
 *   `defineRocketsAuth({ persistence })`.
 *
 * Pass the SAME instance to every persistence consumer in the app:
 *  - `RocketsModule.forRoot({ repository: repo })` (root adapter)
 *  - `defineRocketsAuth({ persistence: { module: repo } })`
 *
 * The planner uses reference equality to group entities per adapter and
 * to decide whether to call `forRoot`. Splitting `repo` into two
 * distinct objects would split the entity list and break the connection.
 *
 * Identical to the helper in `examples/sample-server` — duplicated here so
 * each sample app boots without depending on the other's source tree.
 *
 * @typeParam Connection - the concrete `TypeOrmModuleOptions` member
 *   (e.g. `SqliteConnectionOptions`) chosen at the callsite; preserved
 *   through the spread so driver-specific options stay type-checked.
 */
export function defineTypeOrmRepository<
  Connection extends TypeOrmModuleOptions,
>(connection: Connection): RepositoryBootstrap {
  return {
    name: 'typeorm-bootstrap',

    forFeature(entities: RepositoryProviderOptions[]): DynamicRepositoryModule {
      return TypeOrmRepositoryModule.forFeature(entities);
    },

    forRoot(
      entities: ReadonlyArray<Type<PlainLiteralObject>>,
    ): DynamicModule {
      return TypeOrmModule.forRoot({
        ...connection,
        entities: [...entities],
      });
    },
  };
}
