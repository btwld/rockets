import { Global, Module } from '@nestjs/common';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { UserMetadataRepositoryFixture } from '../../__fixtures__/repositories/user-metadata.repository.fixture';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../modules/user-metadata/constants/user-metadata.constants';

const userMetadataRepositoryToken = getDynamicRepositoryToken(
  USER_METADATA_MODULE_ENTITY_KEY,
);

/**
 * Global repository binding used by most `RocketsModule` e2e apps in this package.
 * Behavioural contract with the user-metadata model service is covered by
 * `__fixtures__/repositories/user-metadata.repository.contract.spec.ts` — update
 * that file when changing the fixture or migrating persistence.
 */
@Global()
@Module({
  providers: [
    {
      provide: userMetadataRepositoryToken,
      useFactory: (): UserMetadataRepositoryFixture =>
        new UserMetadataRepositoryFixture(),
    },
  ],
  exports: [userMetadataRepositoryToken],
})
export class RocketsServerE2eUserMetadataRepoModule {}
