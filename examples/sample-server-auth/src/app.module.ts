import { Global, Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { EventModule } from '@concepta/nestjs-event';
import { defineRocketsAuth } from '@bitwild/rockets-auth';
import { RocketsModule } from '@bitwild/rockets';
import type { EmailSendOptionsInterface } from '@concepta/nestjs-common/dist/domain/email/interfaces/email-send-options.interface';

import { ACService } from './access-control.service';
import { acRules } from './app.acl';
import {
  SAMPLE_NOTIFICATION_HANDLERS,
  SampleSendPasswordUpdatedCommand,
  SampleSendRecoverLoginCommand,
  SampleSendRecoverPasswordCommand,
  SampleSendVerifyCommand,
} from './notification/sample-notification';
import { UserMetadataEntity } from './modules/user/entities/user-metadata.entity';
import {
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
} from './modules/user/dto/user-metadata.dto';
import {
  PetModule,
  PetEntity,
  PetVaccinationEntity,
  PetAppointmentEntity,
  createPetResource,
  createPetVaccinationResource,
  createPetAppointmentResource,
} from './modules/pet';
import { PetAccessQueryService } from './modules/pet/domains/pet/pet-access-query.service';
import {
  UserModule,
  UserEntity,
  UserCredentialEntity,
  UserOtpEntity,
  UserRoleEntity,
  FederatedEntity,
  InvitationEntity,
  UserDto,
  UserCreateDto,
  SampleUserUpdateDto,
} from './modules/user';
import { RoleEntity, RoleDto, RoleUpdateDto } from './modules/role';
import { RoleCreateDto } from './modules/role/role.dto';

const rocketsAuth = defineRocketsAuth({
  persistence: {
    module: TypeOrmRepositoryModule,
    entities: {
      user: UserEntity,
      userCredentials: UserCredentialEntity,
      userOtp: UserOtpEntity,
      role: RoleEntity,
      userRole: UserRoleEntity,
      federatedIdentity: FederatedEntity,
    },
  },
  invitationEntity: InvitationEntity,
  userMetadata: {
    entity: UserMetadataEntity,
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto,
  },
  useFactory: () => {
    const mailLogger = new Logger('SampleMailer');
    return {
      services: {
        mailerService: {
          sendMail: async (options: EmailSendOptionsInterface) => {
            mailLogger.log(`Email would be sent: ${String(options.to)}`);
            return Promise.resolve();
          },
        },
      },
      authentication: {
        ports: {
          recoveryNotification: {
            sendRecoverLoginNotificationCommand: SampleSendRecoverLoginCommand,
            sendRecoverPasswordNotificationCommand:
              SampleSendRecoverPasswordCommand,
            sendPasswordUpdatedNotificationCommand:
              SampleSendPasswordUpdatedCommand,
          },
          verifyNotification: {
            sendVerifyNotificationCommand: SampleSendVerifyCommand,
          },
        },
      },
      settings: {
        role: {
          adminRoleName: 'admin',
          defaultUserRoleName: 'user',
        },
        email: {
          from: 'noreply@example.com',
          baseUrl: 'http://localhost:3000',
          templates: {
            sendOtp: {
              fileName: __dirname + '/../assets/send-otp.template.hbs',
              subject: 'Your One Time Password',
            },
            invitation: {
              logo: '',
              fileName: __dirname + '/../assets/invitation.template.hbs',
              subject: 'You have been invited',
            },
            invitationAccepted: {
              logo: '',
              fileName:
                __dirname + '/../assets/invitation-accepted.template.hbs',
              subject: 'Invitation Accepted',
            },
          },
        },
        otp: {
          assignment: 'userOtp',
          category: 'auth-login',
          type: 'uuid',
          expiresIn: '1h',
        },
      },
    };
  },
  userCrud: {
    model: UserDto,
    dto: {
      createOne: UserCreateDto,
      updateOne: SampleUserUpdateDto,
    },
  },
  roleCrud: {
    model: RoleDto,
    dto: {
      createOne: RoleCreateDto,
      updateOne: RoleUpdateDto,
    },
  },
  invitation: {},
  accessControl: {
    service: new ACService(),
    settings: { rules: acRules },
    appFilter: false,
    imports: [PetModule],
    queryServices: [PetAccessQueryService],
  },
  rocketsDefaults: { enableGlobalGuard: false },
});

@Global()
@Module({
  imports: [
    EventModule.forRoot({}),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        UserMetadataEntity,
        PetEntity,
        PetVaccinationEntity,
        PetAppointmentEntity,
        UserEntity,
        UserCredentialEntity,
        UserOtpEntity,
        RoleEntity,
        UserRoleEntity,
        FederatedEntity,
        InvitationEntity,
      ],
      synchronize: true,
      dropSchema: true,
    }),
    PetModule,
    UserModule,
    RocketsModule.forRoot({
      auth: rocketsAuth,
      repository: TypeOrmRepositoryModule,
      resources: [
        createPetResource(),
        createPetVaccinationResource(),
        createPetAppointmentResource(),
      ],
    }),
  ],
  controllers: [],
  providers: [ACService, ...SAMPLE_NOTIFICATION_HANDLERS],
  exports: [ACService],
})
export class AppModule {}
