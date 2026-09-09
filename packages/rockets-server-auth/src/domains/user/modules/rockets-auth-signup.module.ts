import { DynamicModule, Module, UseGuards } from '@nestjs/common';
import { Operation } from '@concepta/nestjs-core';
import { CqrsModule } from '@nestjs/cqrs';
import { CrudModule, CrudOperationResolver } from '@concepta/nestjs-crud';
import { AuthPublic } from '@concepta/nestjs-authentication';
import {
  assertFailClosedResponse,
  assertNamedSchema,
  assertNoHiddenFields,
  rocketsSchemaValidation,
} from '@concepta/rockets-core';
import { ApiTags } from '@nestjs/swagger';

import { RateLimit, RateLimitGuard } from '@concepta/rockets-core';

import { USER_CRUD_ENTITY_KEY } from '../../../shared/constants/repository-entity-keys.constants';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { rocketsAuthUserCreateSchema } from '../infrastructure/schemas/rockets-auth-user-create.schema';
import { rocketsAuthUserSchema } from '../infrastructure/schemas/rockets-auth-user.schema';
import { resolveUserMetadataSchemas } from '../infrastructure/schemas/rockets-auth-user-metadata.schema';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';

// Application – Commands
import { SignupUserHandler } from '../application/commands/handlers/signup-user.handler';
import { AssignDefaultRoleHandler } from '../application/commands/handlers/assign-default-role.handler';
import { SignupUserCommand } from '../application/commands/impl/signup-user.command';
// Application – Queries
import { GetUserHandler } from '../application/queries/handlers/get-user.handler';
import { authAccountRateLimitKey } from '../../../shared/throttling/auth-rate-limit-keys';

@Module({})
export class RocketsAuthSignUpModule {
  static register(options: UserCrudOptionsExtrasInterface): DynamicModule {
    const userMetadata = resolveUserMetadataSchemas(options.userMetadataConfig);
    const modelSchema =
      options.model ?? rocketsAuthUserSchema(userMetadata.responseSchema);
    assertNamedSchema(modelSchema, 'RocketsAuthSignUpModule: userCrud.model');
    // A consumer-supplied model reaches upstream CRUD serialization
    // directly (no `defineResource` projection): it must strip undeclared
    // keys and carry no `dto: { response: false }` field.
    assertFailClosedResponse(
      modelSchema,
      'RocketsAuthSignUpModule: userCrud.model',
    );
    assertNoHiddenFields(
      modelSchema,
      'RocketsAuthSignUpModule: userCrud.model',
    );
    const createSchema =
      options.dto?.createOne ??
      rocketsAuthUserCreateSchema(userMetadata.updateSchema);
    assertNamedSchema(
      createSchema,
      'RocketsAuthSignUpModule: userCrud.dto.createOne',
    );
    const SignupCommand = options.command?.signupCommand || SignupUserCommand;
    const SignupHandler = options.handlers?.signupHandler || SignupUserHandler;

    return {
      module: RocketsAuthSignUpModule,
      imports: [
        ...(options.imports || []),
        CqrsModule,
        CrudModule.forFeature<RocketsAuthUserEntityInterface>({
          crud: {
            controller: {
              path: options.path || 'signup',
              entity: USER_CRUD_ENTITY_KEY,
              request: { validation: rocketsSchemaValidation },
              response: {
                resource: modelSchema,
              },
              resolver: CrudOperationResolver,
              // Public account creation: attach the rate-limit guard so the
              // per-IP ceiling caps signup volume from one source (account
              // rotation cannot escape it).
              extraDecorators: [
                ApiTags('auth'),
                UseGuards(RateLimitGuard),
                // The account fields THIS route authenticates with, so a
                // decoy the schema strips cannot key the counter.
                RateLimit({
                  default: {
                    key: authAccountRateLimitKey(['email', 'username']),
                  },
                }),
              ],
            },
            operations: [
              {
                operation: Operation.Create,
                request: { body: createSchema },
                command: SignupCommand,
                commandHandler: SignupHandler,
                extraDecorators: [AuthPublic()],
                api: {
                  operation: {
                    summary: 'Create a new user account',
                    description:
                      'Registers a new user in the system with email, username, password and optional metadata',
                  },
                  response: {
                    status: 201,
                    description: 'User created successfully',
                  },
                },
              },
            ],
          },
        }),
      ],
      providers: [
        // SignupHandler is owned by CrudModule.forFeature above.
        AssignDefaultRoleHandler,
        // Application: query handlers
        GetUserHandler,
        // SaveUserMetadataHandler / GetUserMetadataHandler / USER_METADATA_REPOSITORY_TOKEN
        // are provided globally by RocketsAuthUserMetadataModule.
      ],
    };
  }
}
