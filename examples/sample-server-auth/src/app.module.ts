import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { EventModule } from '@concepta/nestjs-event';
import {
  RocketsAuthModule,
  RocketsJwtAuthProvider,
} from '@bitwild/rockets-auth';
import {
  RocketsModule,
} from '@bitwild/rockets';
import {
  EmailSendOptionsInterface,
} from '@concepta/nestjs-common';

// Import ACL configuration
import { ACService } from './access-control.service';
import { acRules } from './app.acl';

import { UserMetadataEntity } from './modules/user/entities/user-metadata.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './modules/user/dto/user-metadata.dto';

// Import modules
import { PetModule } from './modules/pet';
import { UserModule } from './modules/user';

// Import user-related items
import {
  UserEntity,
  UserOtpEntity,
  UserRoleEntity,
  FederatedEntity,
  InvitationEntity,
  UserDto,
  UserCreateDto,
  UserUpdateDto,
  UserTypeOrmCrudAdapter,
  UserMetadataTypeOrmCrudAdapter,
} from './modules/user';

// Import role-related items
import {
  RoleEntity,
  RoleDto,
  RoleUpdateDto,
  RoleTypeOrmCrudAdapter,
} from './modules/role';

// Import pet-related items
import { PetEntity, PetVaccinationEntity, PetAppointmentEntity } from './modules/pet';
import { RoleCreateDto } from './modules/role/role.dto';


@Global()
@Module({
  imports: [
    EventModule.forRoot({}),
    // TypeORM configuration with SQLite in-memory
    TypeOrmExtModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        UserMetadataEntity, 
        PetEntity,
        PetVaccinationEntity,
        PetAppointmentEntity,
        UserEntity,
        UserOtpEntity,
        RoleEntity,
        UserRoleEntity,
        FederatedEntity,
        InvitationEntity
      ],
      synchronize: true,
      dropSchema: true,
    }),
    // Import domain modules
    PetModule,
    UserModule,
    TypeOrmExtModule.forFeature({
      userMetadata: { entity: UserMetadataEntity },
      user: { entity: UserEntity },
      role: { entity: RoleEntity },
      userRole: { entity: UserRoleEntity },
      userOtp: { entity: UserOtpEntity },
      federated: { entity: FederatedEntity },
      invitation: { entity: InvitationEntity },
    }), 
    // RocketsAuthModule MUST be imported BEFORE RocketsModule
    // because RocketsModule depends on RocketsJwtAuthProvider from RocketsAuthModule
    RocketsAuthModule.forRootAsync({
      imports: [
        TypeOrmExtModule.forFeature({
          user: { entity: UserEntity },
          invitation: { entity: InvitationEntity },
        }),
      ],
      // this should be false if we are using the global guard from rockets server
      enableGlobalJWTGuard: false,
      useFactory: () => ({ 
        
        // Required services configuration
        services: {
          mailerService: {
            sendMail: async (options: EmailSendOptionsInterface) => {
              console.log('📧 Email would be sent:', options.to);
              console.log('📧 Email would be html:', options);
              return Promise.resolve();
            },
          },
        },
        // Settings for default role assignment and email/otp configuration
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
                fileName: __dirname + '/../assets/invitation-accepted.template.hbs',
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
      }),
      // Admin user CRUD functionality
      userCrud: {
        imports: [
          TypeOrmModule.forFeature([UserEntity, UserMetadataEntity])
        ],
        adapter: UserTypeOrmCrudAdapter,
        model: UserDto,
        dto: {
          createOne: UserCreateDto,
          updateOne: UserUpdateDto,
        },
        userMetadataConfig: {
          imports: [
            TypeOrmModule.forFeature([UserMetadataEntity])
          ],
          adapter: UserMetadataTypeOrmCrudAdapter,
          entity: UserMetadataEntity,
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
      },
      // Admin role CRUD functionality
      roleCrud: {
        imports: [TypeOrmModule.forFeature([RoleEntity])],
        adapter: RoleTypeOrmCrudAdapter,
        model: RoleDto,
        dto: {
          createOne: RoleCreateDto,
          updateOne: RoleUpdateDto,
        },
      },
      // Access Control configuration
      accessControl: {
        service: new ACService(),
        settings: {
          rules: acRules,
        },
      },
    }),
    // RocketsModule for additional server features with JWT validation  
    // Import AFTER RocketsAuthModule to access RocketsJwtAuthProvider
    RocketsModule.forRootAsync({
      imports: [
        TypeOrmExtModule.forFeature({
          user: { entity: UserEntity },
        }), 
      ],
      inject:[RocketsJwtAuthProvider],
      useFactory: (rocketsJwtAuthProvider: RocketsJwtAuthProvider) => ({
        settings: {},
        // This enables the serverGuard that needs rocketsJwtAuthProvider
        enableGlobalGuard: true,
        authProvider: rocketsJwtAuthProvider,
        userMetadata: {
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
      }),
    }),
    
    
  ],
  controllers: [],
  providers: [ACService],
  exports: [ACService],
})
export class AppModule {}

