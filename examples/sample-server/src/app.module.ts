import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import {
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
} from './dto/user-metadata.dto';
import { defineSampleAuth } from './auth';
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
      // Auth feature bundle (entity + controller + adapter, all typed
      // against `SampleAuthAdapter`). The bundle is auto-prepended to
      // `resources[]` and `bundle.provider` is aliased to
      // `AUTH_ADAPTER_TOKEN`.
      auth: defineSampleAuth(),
      // Single source of truth for user-metadata.
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },
      // Bootstrap-aware adapter — owns `forRoot(entities)` AND
      // `forFeature(entities)`, so each entity is listed once
      // (inside the resource that owns it) instead of repeated in a
      // top-level `TypeOrmModule.forRoot({ entities: [...] })`.
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        dropSchema: true,
      }),
      // Single feature recipe: every app concern is a `xxxFeature` /
      // `xxxResource` bundle declared here. There is no second path
      // ("Nest @Module top-level"); adding a feature means appending
      // to this array.
      resources: [
        // CRUD-shaped bundles.
        petResource,
        petVaccinationResource,
        tagResource,
        appointmentResource,
        reminderResource,
        // Non-CRUD module bundles (persistence + Nest wiring colocated).
        petShareFeature,
        petTransferFeature,
        adminFeature, // before auditFeature — audit consumes adminFeature's exported AdminGuard
        auditFeature,
        eventsFeature,
      ],
    }),
  ],
})
export class AppModule {}
