import { DynamicModule, Module } from '@nestjs/common';
import { Operation } from '@concepta/nestjs-core';
import { CqrsModule } from '@nestjs/cqrs';
import { CrudModule, CrudOperationResolver } from '@concepta/nestjs-crud';
import { AuthPublic } from '@concepta/nestjs-authentication';
import { ApiTags } from '@nestjs/swagger';

import { USER_CRUD_ENTITY_KEY } from '../../../shared/constants/repository-entity-keys.constants';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthUserCreateDto } from '../infrastructure/dto/rockets-auth-user-create.dto';
import { RocketsAuthUserDto } from '../infrastructure/dto/rockets-auth-user.dto';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';

// Application – Commands
import { SignupUserHandler } from '../application/commands/handlers/signup-user.handler';
import { AssignDefaultRoleHandler } from '../application/commands/handlers/assign-default-role.handler';
import { SignupUserCommand } from '../application/commands/impl/signup-user.command';
// Application – Queries
import { GetUserHandler } from '../application/queries/handlers/get-user.handler';

@Module({})
export class RocketsAuthSignUpModule {
  static register(options: UserCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = options.model || RocketsAuthUserDto;
    const CreateDto = options.dto?.createOne || RocketsAuthUserCreateDto;
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
              response: {
                resource: ModelDto,
              },
              resolver: CrudOperationResolver,
              extraDecorators: [ApiTags('auth')],
            },
            operations: [
              {
                operation: Operation.Create,
                request: { body: CreateDto },
                command: SignupCommand,
                commandHandler: SignupHandler,
                extraDecorators: [AuthPublic()],
                api: {
                  operation: {
                    summary: 'Create a new user account',
                    description:
                      'Registers a new user in the system with email, username, password and optional metadata',
                  },
                  body: {
                    type: CreateDto,
                    description: 'User registration information',
                    examples: {
                      standard: {
                        value: {
                          email: 'user@example.com',
                          username: 'user@example.com',
                          password: 'StrongP@ssw0rd',
                          active: true,
                        },
                        summary: 'Standard user registration',
                      },
                      withMetadata: {
                        value: {
                          email: 'user@example.com',
                          username: 'user@example.com',
                          password: 'StrongP@ssw0rd',
                          active: true,
                          userMetadata: {
                            firstName: 'John',
                            lastName: 'Doe',
                            phone: '+1234567890',
                          },
                        },
                        summary: 'User registration with metadata',
                      },
                    },
                  },
                  response: {
                    status: 201,
                    description: 'User created successfully',
                    type: ModelDto,
                  },
                },
              },
            ],
          },
        }),
      ],
      providers: [
        // Application: command handlers
        SignupHandler,
        AssignDefaultRoleHandler,
        // Application: query handlers
        GetUserHandler,
        // SaveUserMetadataHandler / GetUserMetadataHandler / USER_METADATA_REPOSITORY_TOKEN
        // are provided globally by RocketsAuthUserMetadataModule.
      ],
    };
  }
}
