import { CrudAdapter } from '@concepta/nestjs-crud';
import { TypeOrmRepository } from '@concepta/nestjs-repository-typeorm';
import {
  FederatedSqliteEntity,
  InvitationSqliteEntity,
  OtpSqliteEntity,
  RoleAssignmentSqliteEntity,
  RoleSqliteEntity,
  TypeOrmExtModule,
  UserPasswordHistorySqliteEntity,
  UserSqliteEntity,
} from '@concepta/nestjs-typeorm-ext';
import { ReferenceActive } from '@concepta/nestjs-common';
import { UserPasswordDto } from '@concepta/nestjs-user';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiProperty,
  ApiPropertyOptional,
  DocumentBuilder,
  IntersectionType,
  PickType,
  SwaggerModule,
} from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { Column, Entity, Repository } from 'typeorm';
import { RocketsAuthUserDto } from './domains/user/infrastructure/dto/rockets-auth-user.dto';
import { RocketsAuthUserMetadataDto } from './domains/user/infrastructure/dto/rockets-auth-user-metadata.dto';
import { RocketsAuthUserEntityInterface } from './domains/user/interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserMetadataEntityInterface } from './domains/user/interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthRoleDto } from './domains/role/dto/rockets-auth-role.dto';
import { RocketsAuthRoleCreateDto } from './domains/role/dto/rockets-auth-role-create.dto';
import { RocketsAuthRoleUpdateDto } from './domains/role/dto/rockets-auth-role-update.dto';
import { RocketsAuthRoleEntityInterface } from './domains/role/interfaces/rockets-auth-role-entity.interface';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RepositoryModule } from '@concepta/nestjs-repository';
import { RocketsAuthModule } from './rockets-auth.module';
import { ROLE_CRUD_ENTITY_KEY } from './shared/constants/repository-entity-keys.constants';
import { ROCKETS_AUTH_OTP_ASSIGNMENT } from './shared/constants/rockets-auth.constants';

// Create concrete entity implementations for TypeORM
@Entity()
class UserEntity
  extends UserSqliteEntity
  implements RocketsAuthUserEntityInterface
{
  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName!: string;
}

@Entity()
class UserCredentialEntity extends UserPasswordHistorySqliteEntity {
  @Column({ type: 'boolean', default: true })
  active!: ReferenceActive;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  validFrom!: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  validTo!: Date | null;
}

@Entity()
class RoleEntity extends RoleSqliteEntity {}

@Entity()
class UserRoleEntity extends RoleAssignmentSqliteEntity {}

@Entity()
class UserOtpEntity extends OtpSqliteEntity {
  // TypeORM needs this properly defined, but it's not used for swagger gen
  assignee!: UserEntity;
}

@Entity()
class FederatedEntity extends FederatedSqliteEntity {}

@Entity()
class InvitationEntity extends InvitationSqliteEntity {}

@Entity()
class UserMetadataEntity implements RocketsAuthUserMetadataEntityInterface {
  @Column({ type: 'varchar', primary: true })
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'datetime' })
  dateCreated!: Date;

  @Column({ type: 'datetime' })
  dateUpdated!: Date;

  @Column({ type: 'datetime', nullable: true })
  dateDeleted!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'integer', nullable: true })
  age?: number;
}


/**
 * Extended User Metadata DTO
 * Contains all metadata fields that can be associated with a user
 */
class ExtendedUserMetadataDto extends RocketsAuthUserMetadataDto {
  // Index signature to allow additional properties
  [key: string]: unknown;

  @ApiPropertyOptional({
    description: 'First name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'User bio',
    maxLength: 500,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'User age',
    minimum: 18,
    type: 'number',
  })
  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(18)
  age?: number;
}

/**
 * User Metadata Create DTO
 * Used when creating user metadata (includes userId as required by interface)
 */
class ExtendedUserMetadataCreateDto {
  // Index signature to allow additional properties
  [key: string]: unknown;

  @ApiProperty({ description: 'User ID to associate metadata with' })
  @Expose()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({
    description: 'First name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'User bio',
    maxLength: 500,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'User age',
    minimum: 18,
    type: 'number',
  })
  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(18)
  age?: number;
}

/**
 * User Metadata Update DTO
 * Used when updating user metadata (includes id as required by interface)
 */
class ExtendedUserMetadataUpdateDto {
  // Index signature to allow additional properties
  [key: string]: unknown;

  @ApiProperty({ description: 'Metadata ID' })
  @Expose()
  @IsString()
  id!: string;

  @ApiPropertyOptional({
    description: 'First name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'User bio',
    maxLength: 500,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'User age',
    minimum: 18,
    type: 'number',
  })
  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(18)
  age?: number;
}

/**
 * User Metadata Input DTO (for nested use in User DTOs)
 * Used when providing metadata as part of user create/update operations
 */
class UserMetadataInputDto {
  // Index signature to allow additional properties
  [key: string]: unknown;

  @ApiPropertyOptional({
    description: 'First name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'User bio',
    maxLength: 500,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'User age',
    minimum: 18,
    type: 'number',
  })
  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(18)
  age?: number;
}

/**
 * Extended User DTO
 * Complete user representation with nested metadata
 */
class ExtendedUserDto extends RocketsAuthUserDto {
  @ApiPropertyOptional({
    type: ExtendedUserMetadataDto,
    description: 'User metadata containing additional profile information',
  })
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtendedUserMetadataDto)
  userMetadata?: ExtendedUserMetadataDto;
}

/**
 * User Create DTO
 * Used when creating a new user with optional metadata
 */
class ExtendedUserCreateDto extends IntersectionType(
  PickType(ExtendedUserDto, ['email', 'username', 'active'] as const),
  UserPasswordDto,
) {
  // Index signature to allow additional properties
  [key: string]: unknown;

  @ApiPropertyOptional({
    type: UserMetadataInputDto,
    description: 'Initial user metadata',
  })
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => UserMetadataInputDto)
  userMetadata?: UserMetadataInputDto;
}

/**
 * User Update DTO
 * Used when updating an existing user with optional metadata updates
 */
class ExtendedUserUpdateDto {
  // Index signature to allow additional properties
  [key: string]: unknown;

  @ApiProperty({ description: 'User ID' })
  @Expose()
  @IsString()
  id!: string;

  @ApiPropertyOptional({ description: 'Username' })
  @Expose()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @Expose()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Whether the user is active' })
  @Expose()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: UserMetadataInputDto,
    description: 'User metadata updates',
  })
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => UserMetadataInputDto)
  userMetadata?: UserMetadataInputDto;
}

function stripTopLevelResponseSchemas(document: {
  paths?: Record<string, unknown>;
}): void {
  const { paths } = document;
  if (!paths) {
    return;
  }

  for (const pathItem of Object.values(paths)) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }

    for (const operation of Object.values(
      pathItem as Record<string, unknown>,
    )) {
      if (!operation || typeof operation !== 'object') {
        continue;
      }

      const responses = (operation as { responses?: Record<string, unknown> })
        .responses;
      if (!responses || typeof responses !== 'object') {
        continue;
      }

      for (const response of Object.values(responses)) {
        if (!response || typeof response !== 'object') {
          continue;
        }

        // OpenAPI 3 expects schemas under content.<mediaType>.schema.
        delete (response as { schema?: unknown }).schema;
      }
    }
  }
}

/**
 * Generate Swagger documentation JSON file based on RocketsAuth controllers
 */
async function generateSwaggerJson() {
  try {
    process.env.ADMIN_ROLE_NAME = process.env.ADMIN_ROLE_NAME || 'admin';

    @Module({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          synchronize: false,
          autoLoadEntities: true,
          entities: [
            UserEntity,
            RoleEntity,
            UserRoleEntity,
            UserOtpEntity,
            FederatedEntity,
            InvitationEntity,
            UserMetadataEntity,
            InvitationEntity,
          ],
        }),
        TypeOrmModule.forFeature([
          UserEntity,
          RoleEntity,
          UserMetadataEntity,
          InvitationEntity,
        ]),
        TypeOrmExtModule.forRootAsync({
          inject: [],
          useFactory: () => {
            return {
              type: 'sqlite',
              database: ':memory:',
              synchronize: false,
              autoLoadEntities: true,
              // Register our entities
              entities: [
                UserEntity,
                RoleEntity,
                UserRoleEntity,
                UserOtpEntity,
                FederatedEntity,
                InvitationEntity,
                UserMetadataEntity,
                InvitationEntity,
              ],
            };
          },
        }),
        RocketsAuthModule.forRootAsync({
          repositoryPersistence: {
            module: TypeOrmRepositoryModule,
            entities: {
              user: UserEntity,
              userCredentials: UserCredentialEntity,
              userMetadata: UserMetadataEntity,
              userOtp: UserOtpEntity,
              role: RoleEntity,
              userRole: UserRoleEntity,
            },
          },
          imports: [
            TypeOrmModule.forFeature([
              UserEntity,
              RoleEntity,
              UserMetadataEntity,
              InvitationEntity,
            ]),
            TypeOrmExtModule.forFeature({
              user: { entity: UserEntity },
              role: { entity: RoleEntity },
              userRole: { entity: UserRoleEntity },
              userOtp: { entity: UserOtpEntity },
              federated: { entity: FederatedEntity },
              invitation: { entity: InvitationEntity },
            }),
            RepositoryModule.forFeature({
              module: TypeOrmRepositoryModule,
              entities: [
                { key: 'federated', entity: FederatedEntity },
                { key: 'invitation', entity: InvitationEntity },
              ],
            }),
          ],
          userCrud: {
            imports: [
              TypeOrmModule.forFeature([UserEntity, UserMetadataEntity]),
            ],
            model: ExtendedUserDto,
            dto: {
              createOne: ExtendedUserCreateDto,
              updateOne: ExtendedUserUpdateDto,
            },
            userMetadataConfig: {
              imports: [
                TypeOrmModule.forFeature([UserMetadataEntity]),
                TypeOrmExtModule.forFeature({
                  userMetadata: { entity: UserMetadataEntity },
                }),
              ],
              entity: UserMetadataEntity,
              createDto: ExtendedUserMetadataCreateDto,
              updateDto: ExtendedUserMetadataUpdateDto,
            },
          },
          roleCrud: {
            imports: [TypeOrmModule.forFeature([RoleEntity, InvitationEntity])],
            model: RocketsAuthRoleDto,
            dto: {
              createOne: RocketsAuthRoleCreateDto,
              updateOne: RocketsAuthRoleUpdateDto,
            },
          },
          role: {
            imports: [
              TypeOrmExtModule.forFeature({
                role: { entity: RoleEntity },
                userRole: { entity: UserRoleEntity },
              }),
            ],
          },
          invitation: {
            imports: [
              TypeOrmExtModule.forFeature({
                invitation: { entity: InvitationEntity },
              }),
            ],
          },
          useFactory: () => ({
            settings: {
              role: { adminRoleName: 'admin' },
              email: {
                from: 'test@test.com',
                baseUrl: 'http://localhost',
                templates: {
                  sendOtp: { fileName: 'otp.hbs', subject: 'OTP' },
                  invitation: {
                    logo: '',
                    fileName: 'inv.hbs',
                    subject: 'Invitation',
                  },
                  invitationAccepted: {
                    logo: '',
                    fileName: 'inv-acc.hbs',
                    subject: 'Accepted',
                  },
                },
              },
              otp: {
                assignment: ROCKETS_AUTH_OTP_ASSIGNMENT,
                category: 'test',
                type: 'uuid',
                expiresIn: '1h',
              },
            },
            invitation: {
              imports: [
                TypeOrmExtModule.forFeature({
                  invitation: { entity: InvitationEntity },
                }),
              ],
              userModelService: undefined as never,
            },
            services: {
              mailerService: {
                sendMail: () => Promise.resolve(),
              },
            },
          }),
        }),
      ],
    })
    class SwaggerAppModule {}

    // Create the app with SwaggerAppModule
    const app = await NestFactory.create(SwaggerAppModule, {
      logger: ['error'],
    });

    // Create Swagger document builder
    const options = new DocumentBuilder()
      .setTitle('Rockets API')
      .setDescription('API documentation for Rockets Server')
      .setVersion('1.0')
      .setContact('Rockets API Team', '', 'api@rockets.dev')
      .setLicense('BSD-3-Clause', '')
      .addBearerAuth()
      .build();

    // Create the swagger document using SwaggerModule
    const document = SwaggerModule.createDocument(app, options);
    stripTopLevelResponseSchemas(document);

    // Create output directory
    const outputDir = path.resolve('./swagger');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the document to a JSON file
    fs.writeFileSync(
      path.join(outputDir, 'swagger.json'),
      JSON.stringify(document, null, 2),
    );

    // Close the app to free resources
    await app.close();
  } catch (error) {
    console.error('Error generating Swagger documentation:', error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  generateSwaggerJson();
}

// Export the function for use in other modules
export { generateSwaggerJson };
