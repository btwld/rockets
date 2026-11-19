import type { DynamicModule, Type } from '@nestjs/common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import type { AuthAdapterInterface } from './auth-adapter.interface';
import type { RepositoryBootstrap } from './repository-bootstrap.interface';
import type { RocketsUserMetadataConfig } from './rockets-user-metadata-config.interface';
import type { ResourceInput } from '../../infrastructure/resource/planner/app-registration-plan.types';

/**
 * Identity ownership an auth integration claims over the surrounding app:
 * the persistence rows, root repository, and user-metadata contract for the
 * single user space every adapter in the chain authenticates into. At most
 * ONE bootstrap per app may carry this — the server rejects two owners at
 * composition time. Explicit `RocketsModule` values override the single
 * owner's values; they do not make multiple owners valid.
 *
 * Resolved by `@concepta/rockets` (`createServer` / `RocketsModule`);
 * `RocketsCoreModule` does not read it.
 */
export interface AuthBootstrapIdentity {
  readonly resources?: ReadonlyArray<ResourceInput>;
  readonly userMetadata?: RocketsUserMetadataConfig;
  readonly repository?: RepositoryModuleInterface | RepositoryBootstrap;
}

/**
 * Per-integration guard preferences. Unlike {@link AuthBootstrapIdentity},
 * these can coexist across an auth chain; conflicting values fail at
 * composition. Explicit options on `RocketsModule` take precedence.
 *
 * Resolved by `@concepta/rockets` (`createServer` / `RocketsModule`);
 * server composition merges both guard-class lists into the route policy,
 * then strips the contribution object before core.
 */
export interface AuthBootstrapContributions {
  /**
   * Contribute `false` only together with `providesAppGuard: true` — an
   * integration may swap the global guard, never remove it. Removing the
   * guard entirely is an app-level decision (`enableGlobalGuard: false` on
   * the module options).
   */
  readonly enableGlobalGuard?: boolean;
  /**
   * Declares that this integration registers its own app-wide guard
   * (`APP_GUARD`), so contributing `enableGlobalGuard: false` is a guard
   * swap rather than leaving the app unguarded.
   */
  readonly providesAppGuard?: boolean;
  /**
   * The guard CLASSES this integration's `APP_GUARD` may resolve to,
   * so the route audit can recognise them as authentication.
   *
   * `providesAppGuard` declares THAT the integration owns the guard;
   * this declares WHICH class runs, which is what
   * `routePolicy` classification needs — without it, a
   * `defineRocketsAuth` composition reports every route as
   * `unguarded-app` and any declared rule aborts the boot. Consumed by
   * the route audit only; listing a non-authenticating class here (an
   * ACL guard) would recreate the permissive lie the audit exists to
   * remove, so contribute strictly the classes that establish caller
   * identity.
   */
  readonly authGuards?: readonly Type<unknown>[];
  /**
   * Authorization guard classes an integration installs globally.
   *
   * Used when an integration owns `AccessControlModule` and configures a
   * custom `accessControl.appGuard`; server composition merges these into
   * `routePolicy.aclGuards` before core audits the resolved global guards.
   */
  readonly aclGuards?: readonly Type<unknown>[];
}

/**
 * Light / external auth wiring. When `forRoot` is set, core imports the
 * returned module after swagger (repos must exist via `forFeature` first).
 */
export interface AuthBootstrap<
  Adapter extends AuthAdapterInterface = AuthAdapterInterface,
> {
  readonly adapter: Type<Adapter>;
  readonly forRoot?: () => DynamicModule;
  /** Singular identity ownership — at most one bootstrap per app. */
  readonly identity?: AuthBootstrapIdentity;
  /** Guard preferences owned by this integration; explicit app options win. */
  readonly contributes?: AuthBootstrapContributions;
}
