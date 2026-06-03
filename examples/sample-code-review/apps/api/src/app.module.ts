import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RocketsModule } from '@bitwild/rockets';
import { defineFirebaseAuth } from '@bitwild/rockets-adapter-firebase';
import { defineModuleResource } from '@bitwild/rockets-core';

import { resolveFirebaseAuthModuleOptions } from './auth-firebase';
import { UserEntity } from './auth/user.entity';
import { defineApiKeyAuth, apiKeyAuthResource } from './auth-api-key';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import {
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
} from './dto/user-metadata.dto';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';
import { githubFeature } from './github';
import { analysisFeature } from './analysis';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ...(process.env.JEST_WORKER_ID !== undefined
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
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },
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
