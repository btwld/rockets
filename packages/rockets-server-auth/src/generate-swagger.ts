import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import {
  FederatedSqliteEntity,
  OtpSqliteEntity,
  RoleAssignmentSqliteEntity,
  RoleSqliteEntity,
  TypeOrmExtModule,
  UserSqliteEntity,
} from '@concepta/nestjs-typeorm-ext';
import { UserModelService, UserPasswordDto } from '@concepta/nestjs-user';
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
import { RocketsServerAuthUserDto } from './dto/user/rockets-server-auth-user.dto';
import { RocketsServerAuthUserEntityInterface } from './interfaces/user/rockets-server-auth-user-entity.interface';
import { RocketsServerAuthModule } from './rockets-server-auth.module';

// Create concrete entity implementations for TypeORM
@Entity()
class UserEntity
  extends UserSqliteEntity
  implements RocketsServerAuthUserEntityInterface
{
  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName: string;
}

@Entity()
class RoleEntity extends RoleSqliteEntity {}

@Entity()
class UserRoleEntity extends RoleAssignmentSqliteEntity {}

@Entity()
class UserOtpEntity extends OtpSqliteEntity {
  // TypeORM needs this properly defined, but it's not used for swagger gen
  assignee: UserEntity;
}

@Entity()
class FederatedEntity extends FederatedSqliteEntity {
  // TypeORM needs this properly defined, but it's not used for swagger gen
  user: UserEntity;
}

class AdminUserTypeOrmCrudAdapter extends TypeOrmCrudAdapter<RocketsServerAuthUserEntityInterface> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<RocketsServerAuthUserEntityInterface>,
  ) {
    super(repository);
  }
}

// Mock services for swagger generation
class MockUserModelService implements Partial<UserModelService> {
  async byId(id: string) {
    return Promise.resolve({
      id,
      username: 'test',
      firstName: 'John',
      lastName: 'Doe',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['byId']>);
  }
  async byEmail(email: string) {
    return Promise.resolve({
      id: '1',
      email,
      username: 'test',
      firstName: 'John',
      lastName: 'Doe',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['byEmail']>);
  }
  async bySubject(_subject: string) {
    return Promise.resolve({
      id: '1',
      username: 'test',
      firstName: 'John',
      lastName: 'Doe',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['bySubject']>);
  }
  async byUsername(username: string) {
    return Promise.resolve({
      id: '1',
      username,
      firstName: 'John',
      lastName: 'Doe',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['byUsername']>);
  }
  async create(data: Parameters<UserModelService['create']>[0]) {
    return Promise.resolve({
      ...data,
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['create']>);
  }
  async update(data: Parameters<UserModelService['update']>[0]) {
    return Promise.resolve({
      ...data,
      id: '1',
      username: 'test',
      firstName: 'John',
      lastName: 'Doe',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['update']>);
  }
  async replace(data: Parameters<UserModelService['replace']>[0]) {
    return Promise.resolve({
      ...data,
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['replace']>);
  }
  async remove(object: { id: string }) {
    return Promise.resolve({
      id: object.id,
      username: 'test',
      firstName: 'John',
      lastName: 'Doe',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['remove']>);
  }
}

// New DTOs with firstName and lastName fields
@Expose()
class ExtendedUserDto extends RocketsServerAuthUserDto {
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
  test: string;
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
 * Generate Swagger documentation JSON file based on RocketsServerAuth controllers
 */
async function generateSwaggerJson() {
  try {
    const mockUserModelService = new MockUserModelService();

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
          ],
        }),
        TypeOrmModule.forFeature([UserEntity]),
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
              ],
            };
          },
        }),
        RocketsServerAuthModule.forRootAsync({
          imports: [
            TypeOrmModule.forFeature([UserEntity]),
            TypeOrmExtModule.forFeature({
              user: { entity: UserEntity },
              role: { entity: RoleEntity },
              userRole: { entity: UserRoleEntity },
              userOtp: { entity: UserOtpEntity },
              federated: { entity: FederatedEntity },
            }),
          ],
          userCrud: {
            imports: [TypeOrmModule.forFeature([UserEntity])],
            adapter: AdminUserTypeOrmCrudAdapter,
            model: ExtendedUserDto,
            dto: {
              createOne: ExtendedUserCreateDto,
              updateOne: ExtendedUserUpdateDto,
            },
          },
          useFactory: () => ({
            jwt: {
              settings: {
                access: { secret: 'test-secret' },
                refresh: { secret: 'test-secret' },
                default: { secret: 'test-secret' },
              },
            },
            federated: {
              userModelService: mockUserModelService,
            },
            services: {
              mailerService: {
                sendMail: () => Promise.resolve(),
              },
              userModelService: mockUserModelService,
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

    // console.debug(
    //   'Swagger JSON file generated successfully at swagger/swagger.json',
    // );
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
