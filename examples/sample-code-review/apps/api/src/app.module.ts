import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RocketsModule } from '@concepta/rockets';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';
import { defineFirebaseAuth } from '@concepta/rockets-adapter-firebase';
import { defineModuleResource } from '@concepta/rockets-core';
import { createFirebaseAdminApp } from './auth-firebase';

import { resolveFirebaseAuthModuleOptions } from './auth-firebase';
import { UserEntity } from './auth/user.entity';
import { defineApiKeyAuth, apiKeyAuthResource } from './auth-api-key';
import { userMetadataConfig } from './user-metadata.schema';
import { githubFeature } from './github';
import { analysisFeature } from './analysis';

if (process.env.FIREBASE_USE_FAKE === 'true') {
  createFirebaseAdminApp();
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Hermetic under test: never read a developer's real .env files.
      // Vitest sets VITEST=true in every worker (Jest's equivalent was
      // JEST_WORKER_ID, which Vitest never sets).
      ...(process.env.VITEST !== undefined
        ? { ignoreEnvFile: true }
        : { envFilePath: ['.env.local', '.env'] }),
    }),
    RocketsModule.forRoot({
      auth: [
        defineFirebaseAuth({
          forRootAsync: { useFactory: resolveFirebaseAuthModuleOptions },
        }),
        defineApiKeyAuth(),
      ],
      userMetadata: userMetadataConfig,
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: process.env.DATABASE_PATH ?? ':memory:',
        synchronize: true,
        dropSchema: process.env.DATABASE_PATH ? false : true,
      }),
      resources: [
        defineModuleResource({ entities: [UserEntity] }),
        apiKeyAuthResource,
        githubFeature,
        analysisFeature,
      ],
    }),
  ],
})
export class AppModule {}
