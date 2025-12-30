import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import {
  FederatedSqliteEntity,
  InvitationSqliteEntity,
  OtpSqliteEntity,
  RoleAssignmentSqliteEntity,
  RoleSqliteEntity,
  TypeOrmExtModule,
  UserSqliteEntity,
} from '@concepta/nestjs-typeorm-ext';
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
import { Expose } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { Column, Entity, Repository } from 'typeorm';
import { RocketsAuthUserDto } from './domains/user/dto/rockets-auth-user.dto';
import { RocketsAuthUserMetadataDto } from './domains/user/dto/rockets-auth-user-metadata.dto';
import { RocketsAuthUserEntityInterface } from './domains/user/interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserMetadataEntityInterface } from './domains/user/interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthRoleDto } from './domains/role/dto/rockets-auth-role.dto';
import { RocketsAuthRoleCreateDto } from './domains/role/dto/rockets-auth-role-create.dto';
import { RocketsAuthRoleUpdateDto } from './domains/role/dto/rockets-auth-role-update.dto';
import { RocketsAuthRoleEntityInterface } from './domains/role/interfaces/rockets-auth-role-entity.interface';
import { RocketsAuthInvitationDto } from './domains/invitation/dto/rockets-auth-invitation.dto';
import { RocketsAuthInvitationCreateDto } from './domains/invitation/dto/rockets-auth-invitation-create.dto';
import { RocketsAuthInvitationAcceptDto } from './domains/invitation/dto/rockets-auth-invitation-accept.dto';
import { RocketsAuthInvitationRevokeDto } from './domains/invitation/dto/rockets-auth-invitation-revoke.dto';
import { RocketsAuthModule } from './rockets-auth.module';

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
}

class AdminUserTypeOrmCrudAdapter extends TypeOrmCrudAdapter<RocketsAuthUserEntityInterface> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<RocketsAuthUserEntityInterface>,
  ) {
    super(repository);
  }
}

class UserMetadataTypeOrmCrudAdapter extends TypeOrmCrudAdapter<RocketsAuthUserMetadataEntityInterface> {
  constructor(
    @InjectRepository(UserMetadataEntity)
    private readonly repository: Repository<RocketsAuthUserMetadataEntityInterface>,
  ) {
    super(repository);
  }
}

class AdminRoleTypeOrmCrudAdapter extends TypeOrmCrudAdapter<RocketsAuthRoleEntityInterface> {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly repository: Repository<RocketsAuthRoleEntityInterface>,
  ) {
    super(repository);
  }
}

// New DTOs with firstName and lastName fields
@Expose()
class ExtendedUserDto extends RocketsAuthUserDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty()
  @Expose()
  @IsString()
  test: string = '';
}

class ExtendedUserCreateDto extends IntersectionType(
  PickType(ExtendedUserDto, [
    'email',
    'username',
    'active',
    'firstName',
    'lastName',
  ] as const),
  UserPasswordDto,
) {}

class ExtendedUserUpdateDto extends PickType(ExtendedUserDto, [
  'id',
  'username',
  'email',
  'active',
  'firstName',
  'lastName',
] as const) {}

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
          ],
        }),
        TypeOrmModule.forFeature([UserEntity, RoleEntity, UserMetadataEntity, InvitationEntity]),
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
              ],
            };
          },
        }),
        RocketsAuthModule.forRootAsync({
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
          ],
          userCrud: {
            imports: [
              TypeOrmModule.forFeature([UserEntity, UserMetadataEntity]),
            ],
            adapter: AdminUserTypeOrmCrudAdapter,
            model: ExtendedUserDto,
            dto: {
              createOne: ExtendedUserCreateDto,
              updateOne: ExtendedUserUpdateDto,
            },
            userMetadataConfig: {
              adapter: UserMetadataTypeOrmCrudAdapter,
              entity: UserMetadataEntity,
              createDto: RocketsAuthUserMetadataDto,
              updateDto: RocketsAuthUserMetadataDto,
            },
          },
          roleCrud: {
            imports: [TypeOrmModule.forFeature([RoleEntity, InvitationEntity])],
            adapter: AdminRoleTypeOrmCrudAdapter,
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
                assignment: 'userOtp' as const,
                category: 'test',
                type: 'uuid',
                expiresIn: '1h',
              },
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
      .addBearerAuth()
      .build();

    // Create the swagger document using SwaggerModule
    const document = SwaggerModule.createDocument(app, options);

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
