import { Global, Logger, Module } from '@nestjs/common';
import { EventModule } from '@concepta/nestjs-event';
import {
  buildRocketsAuthResources,
  defineRocketsAuth,
  type DefineRocketsAuthInput,
} from '@bitwild/rockets-auth';
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
  createPetResource,
  createPetVaccinationResource,
  createPetAppointmentResource,
} from './modules/pet';
import { PetAccessQueryService } from './modules/pet/domains/pet/pet-access-query.service';
import {
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
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';

// Single TypeORM bootstrap shared by every persistence consumer below.
// `defineTypeOrmRepository` returns a `RepositoryBootstrap`, which the
// planner uses for both:
//   - `forRoot(planEntities)` — DB connection + the union of every
//     entity referenced by `resources[]`, `userMetadata.entity`, and
//     `defineRocketsAuth({ persistence })`.
//   - `forFeature(entities)` — one `DYNAMIC_REPOSITORY_TOKEN_<key>`
//     provider per registered entity.
// Reference equality matters: pass the SAME `repo` instance everywhere,
// otherwise the planner splits the entity list across two adapters and
// `TypeOrmModule.forRoot` boots with an incomplete entity set.
const repo = defineTypeOrmRepository({
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  dropSchema: true,
});

const assetsDir = __dirname + '/../assets';

const rocketsAuthEmailTemplates = {
  sendOtp: {
    fileName: `${assetsDir}/send-otp.template.hbs`,
    subject: 'Your One Time Password',
  },
  invitation: {
    logo: '',
    fileName: `${assetsDir}/invitation.template.hbs`,
    subject: 'You have been invited',
  },
  invitationAccepted: {
    logo: '',
    fileName: `${assetsDir}/invitation-accepted.template.hbs`,
    subject: 'Invitation Accepted',
  },
};

const rocketsAuthRuntimeSettings = {
  role: { adminRoleName: 'admin', defaultUserRoleName: 'user' },
  email: {
    from: 'noreply@example.com',
    baseUrl: 'http://localhost:3000',
    templates: rocketsAuthEmailTemplates,
  },
  otp: {
    assignment: 'userOtp' as const,
    category: 'auth-login',
    type: 'uuid' as const,
    expiresIn: '1h',
  },
};

// Outbound notifications dispatched by the auth flows. Sample apps wire
// CQRS commands (defined in `notification/`) that log instead of sending
// real emails — see `SAMPLE_NOTIFICATION_HANDLERS` in the module
// `providers` list below.
const rocketsAuthNotificationPorts = {
  recoveryNotification: {
    sendRecoverLoginNotificationCommand: SampleSendRecoverLoginCommand,
    sendRecoverPasswordNotificationCommand: SampleSendRecoverPasswordCommand,
    sendPasswordUpdatedNotificationCommand: SampleSendPasswordUpdatedCommand,
  },
  verifyNotification: {
    sendVerifyNotificationCommand: SampleSendVerifyCommand,
  },
};

// Sample mailer: just logs. A real app injects `@nestjs-modules/mailer`
// or any transport implementing `MailerServiceInterface`.
function buildSampleMailerService() {
  const mailLogger = new Logger('SampleMailer');
  return {
    sendMail: async (options: EmailSendOptionsInterface) => {
      mailLogger.log(`Email would be sent: ${String(options.to)}`);
      return Promise.resolve();
    },
  };
}

const rocketsAuthInput: DefineRocketsAuthInput = {
  persistence: {
    module: repo,
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
  useFactory: () => ({
    services: { mailerService: buildSampleMailerService() },
    authentication: { ports: rocketsAuthNotificationPorts },
    settings: rocketsAuthRuntimeSettings,
  }),
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
};

const rocketsAuth = defineRocketsAuth(rocketsAuthInput);
const rocketsAuthResources = buildRocketsAuthResources(
  rocketsAuthInput.persistence,
  rocketsAuthInput.invitationEntity,
);

@Global()
@Module({
  imports: [
    EventModule.forRoot({}),
    PetModule,
    RocketsModule.forRoot({
      auth: rocketsAuth,
      userMetadata: rocketsAuthInput.userMetadata,
      enableGlobalGuard: false,
      repository: repo,
      resources: [
        ...rocketsAuthResources,
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
