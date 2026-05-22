import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import {
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
} from './dto/user-metadata.dto';
import { defineSampleAuth } from './auth';
import { defineFirebaseSampleAuth } from './auth-firebase';
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

// Two auth wirings exercised by the same sample app — proves the
// `AuthAdapterInterface` contract holds regardless of the IdP.
//
//   AUTH_PROVIDER=jwt      → in-process JWT (default; signup + login).
//   AUTH_PROVIDER=firebase → external IdP via @bitwild/rockets-adapter-firebase
//                            (no signup/login routes; tokens come from the
//                            Firebase client SDK).
//
// Default is `jwt` so the legacy curl recipes in README continue to work.
const AUTH_PROVIDER = (process.env.AUTH_PROVIDER ?? 'jwt').toLowerCase();
const auth =
  AUTH_PROVIDER === 'firebase' ? defineFirebaseSampleAuth() : defineSampleAuth();

@Module({
  imports: [
    RocketsModule.forRoot({
      // Auth wiring chosen above. `defineSampleAuth()` yields an
      // `AuthFeatureBundle`; `defineFirebaseSampleAuth()` yields a
      // `RocketsAuthIntegration`. `RocketsModule.forRoot` accepts both
      // shapes — see `resolveAuthExtras` in `rockets.module-definition.ts`.
      auth,
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
