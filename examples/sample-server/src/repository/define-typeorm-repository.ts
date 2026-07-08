import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@bitwild/rockets-repository-typeorm';
import type { RepositoryBootstrap } from '@bitwild/rockets-core';
import type {
  DynamicRepositoryModule,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';

/**
 * Returns a `RepositoryBootstrap` that:
 * - Forwards `forFeature(entities)` to upstream `TypeOrmRepositoryModule`.
 * - Implements `forRoot(entities)` by wrapping `TypeOrmModule.forRoot`
 *   with the connection options the user passed in plus the entity set
 *   the Rockets registration plan derived from `resources[]` and
 *   `userMetadata`.
 *
 * The user passes one factory call to `RocketsModule.forRoot(...)`; the
 * connection and the per-entity registration come out of a single
 * source of truth. Any `entities` key on the supplied connection is
 * overridden with the registration plan's entity list.
 *
 * The `Connection` generic carries the concrete union member (e.g.
 * `SqliteConnectionOptions`) chosen at the callsite, preserving
 * driver-specific discrimination through the spread.
 */
export function defineTypeOrmRepository<Connection extends TypeOrmModuleOptions>(
  connection: Connection,
): RepositoryBootstrap {
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
