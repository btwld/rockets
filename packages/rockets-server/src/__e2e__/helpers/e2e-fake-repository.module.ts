import { Global, Module } from '@nestjs/common';
import { getDynamicRepositoryToken } from '@bitwild/rockets-core';
import type { RepositoryModuleInterface } from '@bitwild/rockets-core';
import { USER_METADATA_MODULE_ENTITY_KEY } from '@bitwild/rockets-core';
import { UserMetadataRepositoryFixture } from '../../__fixtures__/repositories/user-metadata.repository.fixture';

class InMemoryExtraRepo {
  async findOne(): Promise<null> {
    return null;
  }
}

/**
 * Minimal persistence adapter for Rockets e2e apps: binds dynamic-repository
 * tokens without TypeORM. USER_METADATA uses {@link UserMetadataRepositoryFixture}.
 */
export const E2eFakeRepositoryModule: RepositoryModuleInterface = {
  name: 'RocketsServerE2eFakeRepositoryModule',
  forFeature(entities) {
    const providers = entities.map((e) => ({
      provide: getDynamicRepositoryToken(e.key),
      useValue:
        e.key === USER_METADATA_MODULE_ENTITY_KEY
          ? new UserMetadataRepositoryFixture()
          : new InMemoryExtraRepo(),
    }));

    @Global()
    @Module({ providers, exports: providers.map((p) => p.provide) })
    class FakeRepoFeatureModule {}

    return {
      module: FakeRepoFeatureModule,
      providers,
      exports: providers.map((p) => p.provide),
    };
  },
};
