import { defineModuleResource } from '@bitwild/rockets-core';
import { UserEntity } from './user.entity';
import { AuthController } from './auth.controller';
import { SampleAuthAdapter } from './auth.adapter';

/**
 * Auth feature: owns the `UserEntity` dynamic-repository registration AND
 * the auth surface (controller + provider) that injects it.
 *
 * `entities: [UserEntity]` uses the class shorthand — key `'user'` is
 * derived from the class name automatically. Use the explicit
 * `{ key, entity, repository? }` form when you need a custom key or a
 * per-entity adapter override.
 *
 * `SampleAuthAdapter` is in `exports` so it stays globally injectable
 * under `AUTH_ADAPTER_TOKEN` via the `auth: SampleAuthAdapter` field
 * on `RocketsModule.forRoot(...)`.
 */
export const authFeature = defineModuleResource({
  entities: [UserEntity],
  controllers: [AuthController],
  providers: [SampleAuthAdapter],
  exports: [SampleAuthAdapter],
});
