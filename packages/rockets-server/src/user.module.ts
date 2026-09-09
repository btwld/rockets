import { DynamicModule, Module } from '@nestjs/common';
import type { RocketsUserMetadataConfig } from '@concepta/rockets-core';
import { buildMeController } from './gateways/http/build-me-controller';

@Module({})
export class UserModule {
  static register(
    userMetadata: Pick<
      RocketsUserMetadataConfig,
      'updateSchema' | 'responseSchema'
    >,
  ): DynamicModule {
    return {
      module: UserModule,
      controllers: [buildMeController(userMetadata)],
    };
  }
}
