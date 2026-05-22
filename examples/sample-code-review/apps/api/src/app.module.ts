import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RocketsModule } from '@bitwild/rockets';

import { defineFirebaseAuth } from './auth-firebase';
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
      envFilePath: ['.env.local', '.env'],
    }),
    RocketsModule.forRoot({
      auth: defineFirebaseAuth(),
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
      resources: [githubFeature, analysisFeature],
    }),
  ],
})
export class AppModule {}
