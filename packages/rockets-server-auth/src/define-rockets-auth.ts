import { DynamicModule } from '@nestjs/common';
import type { PlainLiteralObject, Type } from '@nestjs/common';
import { FEDERATED_MODULE_DEFAULT_ENTITY_KEY } from '@concepta/nestjs-federated';
import { OtpModule } from '@concepta/nestjs-otp';
import type {
  AuthAdapterInterface,
  RocketsAuthIntegration,
  RocketsUserMetadataConfig,
} from '@bitwild/rockets-core';
import {
  defineModuleResource,
  ROCKETS_AUTH_INTEGRATION_KIND,
} from '@bitwild/rockets-core';

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
    createDto: config.createDto,
    updateDto: config.updateDto,
  };
}

function buildAuthPersistenceResources(
  persistence: RocketsAuthRepositoryPersistenceOptions,
  invitationEntity: Type<PlainLiteralObject> | undefined,
): ReturnType<typeof defineModuleResource>[] {
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
 * Full-stack built-in auth: compiles persistence into Rockets core
 * `resources[]`, wires {@link RocketsAuthModule} without internal
 * `repositoryPersistence`, and returns a {@link RocketsAuthIntegration} for
 * `RocketsModule.forRoot({ auth: ... })`.
 */
export type DefineRocketsAuthInput = RocketsAuthAsyncOptions & {
  /**
   * Auth tables → planner rows (registered only via `RocketsCoreModule` —
   * not passed to `RocketsAuthModule`).
   */
  readonly persistence: RocketsAuthRepositoryPersistenceOptions;
  /** Single source for core `/me` metadata + upstream `UserModule` wiring. */
  readonly userMetadata: RocketsUserMetadataConfig;
  /** User CRUD extras (model, DTOs, handlers, …) — required for the full auth stack. */
  readonly userCrud: NonNullable<RocketsAuthAsyncOptions['userCrud']>;
  /** Optional `invitation` repository key (adds one planner row). */
  readonly invitationEntity?: Type<PlainLiteralObject>;
  readonly rocketsDefaults?: Readonly<{ readonly enableGlobalGuard?: boolean }>;
  readonly authAdapter?: Type<AuthAdapterInterface>;
};

export function defineRocketsAuth(
  input: DefineRocketsAuthInput,
): RocketsAuthIntegration {
  const resources = buildAuthPersistenceResources(
    input.persistence,
    input.invitationEntity,
  );

  const asyncOptions = buildAsyncOptionsForAuthModule(input);

  return {
    kind: ROCKETS_AUTH_INTEGRATION_KIND,
    resources,
    nestImports: [RocketsAuthModule.forRootAsync(asyncOptions)],
    authAdapter: input.authAdapter ?? RocketsJwtAuthAdapter,
    userMetadata: input.userMetadata,
    rocketsDefaults: input.rocketsDefaults,
  };
}
