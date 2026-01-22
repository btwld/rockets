import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import {
  RocketsModule,
  RocketsOptionsInterface,
} from '@bitwild/rockets';
import { DocumentBuilder } from '@nestjs/swagger';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import { PetEntity } from './entities/pet.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './dto/user-metadata.dto';
import { MockAuthProvider } from './providers/mock-auth.provider';
import { PetsController } from './controllers/pets.controller';
import { PetModule } from './modules/pet/pet.module';

const options: RocketsOptionsInterface = {
  settings: {},
  authProvider: new MockAuthProvider(),
  userMetadata: {
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto,
  },
};

@Module({
  imports: [
    // TypeORM configuration with SQLite in-memory
    TypeOrmExtModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [UserMetadataEntity, PetEntity],
      synchronize: true,
      dropSchema: true,
    }),
    // Import Pet module for proper dependency injection
    PetModule,
    TypeOrmExtModule.forFeature({
      userMetadata: { entity: UserMetadataEntity },
    }),
    RocketsModule.forRoot(options),
  ],
  controllers: [PetsController],
  providers: [
    MockAuthProvider,
  ],
})
export class AppModule {}


