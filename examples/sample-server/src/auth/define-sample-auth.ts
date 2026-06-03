import type { AuthBootstrap } from '@bitwild/rockets-core';
import { defineModuleResource } from '@bitwild/rockets-core';
import { UserEntity } from './user.entity';
import { AuthController } from './auth.controller';
import { SampleAuthAdapter } from './auth.adapter';

/** Entity row only — adapter + controller live in {@link defineSampleAuth}. */
export const sampleAuthUserResource = defineModuleResource({
  entities: [UserEntity],
});

/**
 * JWT auth for the sample app. Pair with `sampleAuthUserResource` in
 * `RocketsModule.forRoot({ resources: [...] })`.
 */
export function defineSampleAuth(): AuthBootstrap<SampleAuthAdapter> {
  return {
    adapter: SampleAuthAdapter,
    forRoot: () => ({
      module: class SampleAuthHostModule {},
      providers: [SampleAuthAdapter],
      controllers: [AuthController],
      exports: [SampleAuthAdapter],
    }),
  };
}
