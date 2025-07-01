import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { Module } from '@nestjs/common';
import { RocketsServerModule } from './rockets-server.module';
import { Entity } from 'typeorm';
import {
  UserSqliteEntity,
  OtpSqliteEntity,
  FederatedSqliteEntity,
  TypeOrmExtModule,
} from '@concepta/nestjs-typeorm-ext';
import { UserModelService } from '@concepta/nestjs-user';

// Create concrete entity implementations for TypeORM
@Entity()
class UserEntity extends UserSqliteEntity {}

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

// Mock services for swagger generation
class MockUserModelService implements Partial<UserModelService> {
  async byId(id: string) {
    return Promise.resolve({
      id,
      username: 'test',
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
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
    } as unknown as ReturnType<UserModelService['remove']>);
  }
}

/**
 * Generate Swagger documentation JSON file based on RocketsServer controllers
 */
async function generateSwaggerJson() {
  try {
    const mockUserModelService = new MockUserModelService();

    @Module({
      imports: [
        TypeOrmExtModule.forRootAsync({
          inject: [],
          useFactory: () => {
            return {
              type: 'sqlite',
              database: ':memory:',
              synchronize: false,
              autoLoadEntities: true,
              // Register our entities
              entities: [UserEntity, UserOtpEntity, FederatedEntity],
            };
          },
        }),
        RocketsServerModule.forRoot({
          user: {
            imports: [
              TypeOrmExtModule.forFeature({
                user: {
                  entity: UserEntity,
                },
              }),
            ],
          },
          otp: {
            imports: [
              TypeOrmExtModule.forFeature({
                userOtp: {
                  entity: UserOtpEntity,
                },
              }),
            ],
          },
          federated: {
            imports: [
              TypeOrmExtModule.forFeature({
                federated: {
                  entity: FederatedEntity,
                },
              }),
            ],
            userModelService: mockUserModelService,
          },
          jwt: {
            settings: {
              access: { secret: 'test-secret' },
              refresh: { secret: 'test-secret' },
              default: { secret: 'test-secret' },
            },
          },
          services: {
            mailerService: {
              sendMail: () => Promise.resolve(),
            },
            userModelService: mockUserModelService,
          },
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
