import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { userMetadataConfig } from './user-metadata.schema';
import { defineSampleAuth, sampleAuthUserResource } from './auth';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';
import { petResource } from './resources/pet';
import { petVaccinationResource } from './resources/pet-vaccination';
// `/tags` is fully zod-driven (nestjs-zod DTOs + generated entity from
// `tagSchema`). The handwritten classic twin used to live beside it at
// `/tags-classic`; it now exists only as the golden-test control fixture
// (`test/__fixtures__/tag-classic-control`).
import { tagZodResource } from './resources/tag';
// Library pair: zod resources showcasing dto field roles, the FK
// relation meta (book.authorId → author, exposed in responses) and the
// keyed operations form (soft delete + restore + replace).
import { authorZodResource, bookZodResource } from './resources/library';
import { petShareFeature } from './resources/pet-share';
import { petTransferFeature } from './resources/pet-transfer';
import {
  appointmentResource,
  // Zod-driven: entity + response DTO generated from `reminderSchema`,
  // FK relation to the (classic) appointment entity via relation meta.
  reminderZodResource,
} from './resources/appointment';
import { adminFeature } from './admin';
import { auditFeature } from './audit';
import { eventsFeature } from './events';

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: defineSampleAuth(),
      userMetadata: userMetadataConfig,
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
        tagZodResource,
        authorZodResource,
        bookZodResource,
        appointmentResource,
        reminderZodResource,
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
