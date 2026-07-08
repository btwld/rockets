import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@bitwild/rockets-repository-typeorm';
import type { RepositoryBootstrap } from '@bitwild/rockets-core';
import type {
  DynamicRepositoryModule,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';

export function defineTypeOrmRepository<
  Connection extends TypeOrmModuleOptions,
>(connection: Connection): RepositoryBootstrap {
  return {
    name: 'typeorm-bootstrap',

    forFeature(entities: RepositoryProviderOptions[]): DynamicRepositoryModule {
      return TypeOrmRepositoryModule.forFeature(entities);
    },

    forRoot(entities: ReadonlyArray<Type<PlainLiteralObject>>): DynamicModule {
      return TypeOrmModule.forRoot({
        ...connection,
        entities: [...entities],
      });
    },
  };
}
