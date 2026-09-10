import { Module } from '@nestjs/common';
import { createServer } from '@concepta/rockets';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';
import { userMetadataConfig } from './user-metadata.schema';
import { defineSampleAuth, sampleAuthUserResource } from './auth';
import { petResource } from './resources/pet';
import { petVaccinationResource } from './resources/pet-vaccination';
// `/tags` is fully zod-driven (schemas + generated entity from
// `tagSchema`).
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

export const server = createServer({
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
});

@Module({
  imports: [server],
})
export class AppModule {}
