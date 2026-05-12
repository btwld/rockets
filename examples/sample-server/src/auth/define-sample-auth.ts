import { defineAuthFeature } from '@bitwild/rockets-core';
import type { AuthFeatureBundle } from '@bitwild/rockets-core';
import { UserEntity } from './user.entity';
import { AuthController } from './auth.controller';
import { SampleAuthAdapter } from './auth.adapter';

/**
 * Single public entry-point for the sample auth feature.
 *
 * Returns a self-contained `AuthFeatureBundle` that owns:
 *  - the adapter class (typed as `Type<SampleAuthAdapter>`)
 *  - the `UserEntity` dynamic-repository registration
 *  - the `/auth` controller (signup + login)
 *  - the adapter as a provider AND as an export so
 *    `AUTH_ADAPTER_TOKEN` can alias it via `useExisting` once
 *    `RocketsModule` expands the bundle.
 *
 * Consumed as `RocketsModule.forRoot({ auth: defineSampleAuth(), ... })`.
 */
export function defineSampleAuth(): AuthFeatureBundle<SampleAuthAdapter> {
  return defineAuthFeature({
    entities: [UserEntity],
    adapter: SampleAuthAdapter,
    controllers: [AuthController],
  });
}
