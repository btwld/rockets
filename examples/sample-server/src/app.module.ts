import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RocketsModule } from '@bitwild/rockets';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './dto/user-metadata.dto';
import {
  UserEntity,
  SampleAuthProvider,
  AuthModule,
  USER_ENTITY_KEY,
} from './auth';
import {
  petResource,
  petTagResource,
  PetEntity,
  PetTagEntity,
} from './resources/pet';
import {
  petVaccinationResource,
  PetVaccinationEntity,
} from './resources/pet-vaccination';
import { tagResource, TagEntity } from './resources/tag';
import { PetShareEntity, PetShareModule } from './resources/pet-share';
import { PET_SHARE_ENTITY_KEY } from './resources/pet-share/pet-share.constants';
import { PetTransferModule } from './resources/pet-transfer';
import { AdminModule } from './admin';
import {
  AppointmentEntity,
  ReminderEntity,
  appointmentResource,
  reminderResource,
} from './resources/appointment';
import { AuditLogEntity, AuditModule } from './audit';
import { AUDIT_LOG_ENTITY_KEY } from './audit/audit-log.constants';
import { EventsModule } from './events';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        UserEntity,
        UserMetadataEntity,
        PetEntity,
        PetVaccinationEntity,
        TagEntity,
        PetShareEntity,
        PetTagEntity,
        AppointmentEntity,
        ReminderEntity,
        AuditLogEntity,
      ],
      synchronize: true,
      dropSchema: true,
    }),
    AuthModule,
    RocketsModule.forRootAsync({
      imports: [AuthModule],
      inject: [SampleAuthProvider],
      useFactory: (authProvider: SampleAuthProvider) => ({
        authProvider,
        userMetadata: {
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
      }),
      repositories: {
        module: TypeOrmRepositoryModule,
        userMetadata: { entity: UserMetadataEntity },
        entities: [
          { key: USER_ENTITY_KEY, entity: UserEntity },
          { key: PET_SHARE_ENTITY_KEY, entity: PetShareEntity },
          { key: AUDIT_LOG_ENTITY_KEY, entity: AuditLogEntity },
        ],
      },
      // pet, petTag, petVaccination and tag entities are auto-contributed
      // by their respective defineResource() bundles below.
      resources: [
        petResource,
        petTagResource,
        petVaccinationResource,
        tagResource,
        appointmentResource,
        reminderResource,
      ],
    }),
    PetShareModule,
    PetTransferModule,
    AdminModule,
    AuditModule,
    EventsModule,
  ],
})
export class AppModule {}
