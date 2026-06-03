import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import {
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
} from './dto/user-metadata.dto';
import { defineSampleAuth, sampleAuthUserResource } from './auth';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';
import { petResource } from './resources/pet';
import { petVaccinationResource } from './resources/pet-vaccination';
import { tagResource } from './resources/tag';
import { petShareFeature } from './resources/pet-share';
import { petTransferFeature } from './resources/pet-transfer';
import {
  appointmentResource,
  reminderResource,
} from './resources/appointment';
import { adminFeature } from './admin';
import { auditFeature } from './audit';
import { eventsFeature } from './events';

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: defineSampleAuth(),
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        dropSchema: true,
      }),
      resources: [
        sampleAuthUserResource,
        petResource,
        petVaccinationResource,
        tagResource,
        appointmentResource,
        reminderResource,
        petShareFeature,
        petTransferFeature,
        adminFeature,
        auditFeature,
        eventsFeature,
      ],
    }),
  ],
})
export class AppModule {}
