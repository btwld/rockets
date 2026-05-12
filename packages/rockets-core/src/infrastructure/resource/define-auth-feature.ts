import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { AuthAdapterInterface } from '../../domain/interfaces/auth-adapter.interface';
import type {
  ModuleResource,
  ModuleResourceEntityInput,
} from '../../domain/interfaces/module-resource.interface';
import { defineModuleResource } from './define-module-resource';

/**
 * Config consumed by {@link defineAuthFeature}.
 *
 * Mirrors the shape of {@link defineModuleResource} but pins the auth
 * adapter generic so the returned bundle's `provider` carries the
 * concrete adapter type instead of the generic interface.
 *
 * `entities` accepts the same input shapes as `defineModuleResource`
 * (class shorthand → key derived from class name, or the explicit
 * `{ key, entity, repository? }` form) — useful when an auth feature
 * owns more than one persistence row (e.g. user + user-session +
 * password-reset-token).
 */
export interface AuthFeatureConfig<
  Adapter extends AuthAdapterInterface = AuthAdapterInterface,
> {
  readonly entities: ReadonlyArray<ModuleResourceEntityInput>;
  readonly adapter: Type<Adapter>;
  readonly controllers?: NonNullable<DynamicModule['controllers']>;
  readonly imports?: NonNullable<DynamicModule['imports']>;
  readonly providers?: ReadonlyArray<Provider>;
  readonly exports?: NonNullable<DynamicModule['exports']>;
}

export const AUTH_FEATURE_BUNDLE_KIND = 'auth-feature' as const;

/**
 * The bundle returned by {@link defineAuthFeature}.
 *
 * - `provider` is the auth adapter class typed against the concrete
 *   generic, so callsites read it back as `Type<MyAdapter>` rather than
 *   `Type<AuthAdapterInterface>`.
 * - `resource` is a fully-formed {@link ModuleResource} that owns the
 *   user entity, the auth controller(s), and the adapter provider —
 *   `RocketsModule` prepends it to `resources[]` automatically.
 */
export interface AuthFeatureBundle<
  Adapter extends AuthAdapterInterface = AuthAdapterInterface,
> {
  readonly kind: typeof AUTH_FEATURE_BUNDLE_KIND;
  readonly provider: Type<Adapter>;
  readonly resource: ModuleResource;
}

export function isAuthFeatureBundle(
  value: unknown,
): value is AuthFeatureBundle {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === AUTH_FEATURE_BUNDLE_KIND
  );
}

/**
 * Compose a typed auth feature bundle in one call.
 *
 * Pair with `RocketsModule.forRoot({ auth: ... })`: passing the bundle
 * as `auth` makes the server use `bundle.provider` as the auth adapter
 * AND prepend `bundle.resource` to the resource list, replacing the
 * "declare a `defineModuleResource` for auth, then also pass
 * `auth: AuthAdapter` on the side" two-step.
 *
 * @example
 * ```ts
 * export function defineSampleAuth() {
 *   return defineAuthFeature({
 *     entities: [UserEntity, SessionEntity],
 *     adapter: SampleAuthAdapter,
 *     controllers: [AuthController],
 *   });
 * }
 *
 * RocketsModule.forRoot({ auth: defineSampleAuth(), ... });
 * ```
 */
export function defineAuthFeature<Adapter extends AuthAdapterInterface>(
  config: AuthFeatureConfig<Adapter>,
): AuthFeatureBundle<Adapter> {
  const resource = defineModuleResource({
    entities: config.entities,
    imports: config.imports,
    controllers: config.controllers,
    providers: [config.adapter, ...(config.providers ?? [])],
    exports: [config.adapter, ...(config.exports ?? [])],
  });

  return {
    kind: AUTH_FEATURE_BUNDLE_KIND,
    provider: config.adapter,
    resource,
  };
}
