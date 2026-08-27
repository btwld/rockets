import { JwtGuard } from '@concepta/nestjs-authentication';
import { DynamicModule } from '@nestjs/common';
import type { PlainLiteralObject, Type } from '@nestjs/common';
import { FEDERATED_MODULE_DEFAULT_ENTITY_KEY } from '@concepta/nestjs-federated';
import type { InvitationEntityInterface } from '@concepta/nestjs-invitation';
import { OtpModule } from '@concepta/nestjs-otp';
import type {
  AuthAdapterInterface,
  AuthBootstrap,
  ResourceInput,
  RocketsUserMetadataConfig,
} from '@concepta/rockets-core';
import { defineModuleResource } from '@concepta/rockets-core';

import { RocketsJwtAuthAdapter } from './provider/rockets-jwt-auth.adapter';
import type { RocketsAuthAsyncOptions } from './rockets-auth.module-definition';
import { RocketsAuthModule } from './rockets-auth.module';
import type { UserMetadataConfigInterface } from './shared/interfaces/rockets-auth-options-extras.interface';
import type {
  RocketsAuthRepositoryPersistenceEntities,
  RocketsAuthRepositoryPersistenceOptions,
} from './shared/interfaces/rockets-auth-repository-persistence.interface';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_CREDENTIALS_ENTITY_KEY,
  USER_CRUD_ENTITY_KEY,
  USER_OTP_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from './shared/constants/repository-entity-keys.constants';

const ENTITY_KEY_BY_PROP: Record<
  keyof Required<RocketsAuthRepositoryPersistenceEntities>,
  string
> = {
  user: USER_CRUD_ENTITY_KEY,
  userCredentials: USER_CREDENTIALS_ENTITY_KEY,
  userOtp: USER_OTP_ENTITY_KEY,
  role: ROLE_CRUD_ENTITY_KEY,
  userRole: USER_ROLE_ENTITY_KEY,
  federatedIdentity: FEDERATED_MODULE_DEFAULT_ENTITY_KEY,
};

function toUserMetadataConfig(
  config: RocketsUserMetadataConfig,
): UserMetadataConfigInterface {
  return {
    entity: config.entity,
    updateSchema: config.updateSchema,
    responseSchema: config.responseSchema,
  };
}

/**
 * Planner rows for auth persistence tables. {@link defineRocketsAuth} includes
 * these automatically; this helper remains public for lower-level composition.
 */
export function buildRocketsAuthResources(
  persistence: RocketsAuthRepositoryPersistenceOptions,
  invitationEntity?: Type<InvitationEntityInterface>,
): ReadonlyArray<ResourceInput> {
  const { module: repositoryModule, entities } = persistence;
  const entityRows: Array<{
    readonly key: string;
    readonly entity: Type<PlainLiteralObject>;
    readonly repository: RocketsAuthRepositoryPersistenceOptions['module'];
  }> = [];

  for (const prop of Object.keys(
    ENTITY_KEY_BY_PROP,
  ) as (keyof RocketsAuthRepositoryPersistenceEntities)[]) {
    const entityClass = entities[prop];
    if (entityClass !== undefined) {
      entityRows.push({
        key: ENTITY_KEY_BY_PROP[prop],
        entity: entityClass,
        repository: repositoryModule,
      });
    }
  }

  if (invitationEntity !== undefined) {
    entityRows.push({
      key: 'invitation',
      entity: invitationEntity,
      repository: repositoryModule,
    });
  }

  const otpImports: NonNullable<DynamicModule['imports']> =
    entities.userOtp !== undefined
      ? [OtpModule.forFeature([USER_OTP_ENTITY_KEY])]
      : [];

  return [
    defineModuleResource({
      entities: entityRows,
      ...(otpImports.length > 0 ? { imports: otpImports } : {}),
    }),
  ];
}

function buildAsyncOptionsForAuthModule(
  input: DefineRocketsAuthInput,
): RocketsAuthAsyncOptions {
  const {
    persistence: _persistence,
    userMetadata,
    invitationEntity: _invitationEntity,
    rocketsDefaults: _rocketsDefaults,
    authAdapter: _authAdapter,
    userCrud,
    ...rest
  } = input;

  return {
    ...rest,
    userCrud: {
      ...userCrud,
      userMetadataConfig:
        userCrud.userMetadataConfig ?? toUserMetadataConfig(userMetadata),
    },
  };
}

/**
 * Built-in auth: returns a complete {@link AuthBootstrap} for
 * `RocketsModule.forRoot({ auth })`, including its persistence resources,
 * user-metadata contract, root repository default, and guard preference.
 */
export type DefineRocketsAuthInput = RocketsAuthAsyncOptions & {
  /**
   * Auth tables → planner rows (registered only via `RocketsCoreModule` —
   * not passed to `RocketsAuthModule`).
   */
  readonly persistence: RocketsAuthRepositoryPersistenceOptions;
  /** Used by core `/me` and upstream `UserModule` (`userCrud.userMetadataConfig`). */
  readonly userMetadata: RocketsUserMetadataConfig;
  readonly userCrud: NonNullable<RocketsAuthAsyncOptions['userCrud']>;
  readonly invitationEntity?: Type<InvitationEntityInterface>;
  readonly rocketsDefaults?: Readonly<{ readonly enableGlobalGuard?: boolean }>;
  readonly authAdapter?: Type<AuthAdapterInterface>;
};

export function defineRocketsAuth(
  input: DefineRocketsAuthInput,
): AuthBootstrap {
  const rocketsOwnsGlobalGuard =
    input.rocketsDefaults?.enableGlobalGuard === true;
  const configuredUpstreamGuard = input.auth?.appGuard;

  if (
    rocketsOwnsGlobalGuard &&
    configuredUpstreamGuard !== undefined &&
    configuredUpstreamGuard !== false
  ) {
    throw new Error(
      'defineRocketsAuth: Rockets global guard ownership requires ' +
        '`auth.appGuard: false`. Configure exactly one global ' +
        'authentication guard.',
    );
  }

  const normalizedInput = rocketsOwnsGlobalGuard
    ? {
        ...input,
        auth: { ...input.auth, appGuard: false as const },
      }
    : input;
  const asyncOptions = buildAsyncOptionsForAuthModule(normalizedInput);

  return {
    adapter: input.authAdapter ?? RocketsJwtAuthAdapter,
    forRoot: () => RocketsAuthModule.forRootAsync(asyncOptions),
    // Built-in auth owns the user space the whole adapter chain
    // authenticates into — it is the app's single identity owner.
    identity: {
      resources: buildRocketsAuthResources(
        input.persistence,
        input.invitationEntity,
      ),
      userMetadata: input.userMetadata,
      repository: input.persistence.module,
    },
    contributes: {
      // AuthenticationModule installs its own JwtGuard by default. Avoid two
      // global authentication guards unless a mixed-auth host explicitly asks
      // Rockets to own the ordered adapter chain.
      enableGlobalGuard: input.rocketsDefaults?.enableGlobalGuard ?? false,
      // The upstream guard exists unless the host disables it via
      // `auth.appGuard: false` — declaring the swap lets the server's
      // composition invariant reject the half-configured state where
      // neither guard would run.
      providesAppGuard: normalizedInput.auth?.appGuard !== false,
      // WHICH class that guard is, so the route audit can classify it
      // as authentication. A custom `auth.appGuard` instance is
      // recognised by its constructor; the default is upstream
      // `JwtGuard`. Without this, a policy-declaring app built on this
      // composition reports every route unguarded and refuses to boot.
      authGuards:
        normalizedInput.auth?.appGuard === false
          ? []
          : [
              typeof configuredUpstreamGuard === 'object' &&
              configuredUpstreamGuard !== null
                ? (configuredUpstreamGuard.constructor as Type<unknown>)
                : JwtGuard,
            ],
    },
  };
}
