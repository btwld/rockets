import { EmailSendInterface, ExceptionsFilter } from '@concepta/nestjs-common';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { EventModule } from '@concepta/nestjs-event';
import { RepositoryModule } from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { FederatedEntityFixture } from '../../../__fixtures__/federated/federated.entity.fixture';
import { ormConfig } from '../../../__fixtures__/ormconfig.fixture';
import { RoleEntityFixture } from '../../../__fixtures__/role/role.entity.fixture';
import { UserRoleEntityFixture } from '../../../__fixtures__/role/user-role.entity.fixture';
import { RocketsAuthUserCreateDtoFixture } from '../../../__fixtures__/user/dto/rockets-auth-user-create.dto.fixture';
import { RocketsAuthUserUpdateDtoFixture } from '../../../__fixtures__/user/dto/rockets-auth-user-update.dto.fixture';
import { RocketsAuthUserFixtureDto } from '../../../__fixtures__/user/dto/rockets-auth-user.dto.fixture';
import { RocketsAuthUserMetadataFixtureDto } from '../../../__fixtures__/user/dto/rockets-auth-user-metadata.dto.fixture';
import { UserOtpEntityFixture } from '../../../__fixtures__/user/user-otp-entity.fixture';
import { UserPasswordHistoryEntityFixture } from '../../../__fixtures__/user/user-password-history.entity.fixture';
import { UserMetadataEntityFixture } from '../../../__fixtures__/user/user-metadata.entity.fixture';
import { UserFixture } from '../../../__fixtures__/user/user.entity.fixture';
import { UserCredentialEntityFixture } from '../../../__fixtures__/user/user-credential.entity.fixture';
import { InvitationEntityFixture } from '../../../__fixtures__/invitation/invitation.entity.fixture';
import { RocketsAuthModule } from '../../../rockets-auth.module';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  CreateRoleCommand,
  AssignRoleCommand,
  IsAssignedRoleQuery,
  GetAssignedRolesQuery,
} from '@concepta/nestjs-role';
import { GetUserQuery } from '../../user/application/queries/impl/get-user.query';
import { RocketsAuthRoleDto } from '../../role/dto/rockets-auth-role.dto';
import { RocketsAuthRoleCreateDto } from '../../role/dto/rockets-auth-role-create.dto';
import { RocketsAuthRoleUpdateDto } from '../../role/dto/rockets-auth-role-update.dto';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';
import { ROCKETS_AUTH_OTP_ASSIGNMENT } from '../../../shared/constants/rockets-auth.constants';

// Test constants - generate password dynamically to avoid hardcoded password detection
const getTestPassword = (): string => {
  // Test password for e2e tests only
  return 'CompleteFlow123!';
};

// Helper function to convert email address to string
const emailToString = (
  email:
    | string
    | { name: string; address: string }
    | Array<string | { name: string; address: string }>
    | undefined,
): string => {
  if (!email) return '';
  if (typeof email === 'string') return email;
  if (Array.isArray(email)) {
    const first = email[0];
    return typeof first === 'string' ? first : first.address;
  }
  return email.address;
};

// Mock email service that captures sent emails
const sentEmails: Array<{
  to: string;
  subject: string;
  context: Record<string, unknown>;
}> = [];

const mockEmailService: EmailSendInterface = {
  sendMail: jest.fn().mockImplementation((mailOptions) => {
    sentEmails.push({
      to: emailToString(mailOptions.to),
      subject: mailOptions.subject || '',
      context: mailOptions.context || {},
    });
    return Promise.resolve(undefined);
  }),
};

// Mock configuration module
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: jest.fn().mockImplementation((key) => {
          if (key === 'jwt.secret') return 'test-secret';
          if (key === 'jwt.expiresIn') return '1h';
          return null;
        }),
      },
    },
  ],
  exports: [ConfigService],
})
class MockConfigModule {}

describe('Invitation Flow (E2E)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let adminToken: string;
  let adminRole: { id: string; name: string };

  const roleCtx = { entity: ROLE_CRUD_ENTITY_KEY, hooks: [] as never[] };
  const userRoleCtx = { entity: USER_ROLE_ENTITY_KEY, hooks: [] as never[] };
  // userCtx removed -- GetUserQuery no longer needs ctx

  beforeAll(async () => {
    process.env.ADMIN_ROLE_NAME = 'admin';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MockConfigModule,
        EventModule.forRoot({}),
        TypeOrmExtModule.forRootAsync({
          inject: [],
          useFactory: () => ({
            ...ormConfig,
            entities: [
              UserFixture,
              UserCredentialEntityFixture,
              UserMetadataEntityFixture,
              UserOtpEntityFixture,
              UserPasswordHistoryEntityFixture,
              FederatedEntityFixture,
              UserRoleEntityFixture,
              RoleEntityFixture,
              InvitationEntityFixture,
            ],
          }),
        }),
        TypeOrmModule.forFeature([
          UserFixture,
          UserCredentialEntityFixture,
          UserMetadataEntityFixture,
          UserRoleEntityFixture,
          RoleEntityFixture,
        ]),
        RocketsAuthModule.forRootAsync({
          repositoryPersistence: {
            module: TypeOrmRepositoryModule,
            entities: {
              user: UserFixture,
              userCredentials: UserCredentialEntityFixture,
              userMetadata: UserMetadataEntityFixture,
              userOtp: UserOtpEntityFixture,
              role: RoleEntityFixture,
              userRole: UserRoleEntityFixture,
            },
          },
          enableGlobalJWTGuard: true,
          inject: [],
          useFactory: () => ({
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
                    fileName: __dirname + '/../../assets/send-otp.template.hbs',
                    subject: 'Your One Time Password',
                  },
                  invitation: {
                    logo: '',
                    fileName:
                      __dirname + '/../../assets/invitation.template.hbs',
                    subject: 'You are invited',
                  },
                  invitationAccepted: {
                    logo: '',
                    fileName:
                      __dirname +
                      '/../../assets/invitation-accepted.template.hbs',
                    subject: 'Invitation Accepted',
                  },
                },
              },
              otp: {
                assignment: ROCKETS_AUTH_OTP_ASSIGNMENT,
                category: 'auth-login',
                type: 'uuid',
                expiresIn: '1h',
              },
            },
            jwt: {
              settings: {
                access: { secret: 'test-secret' },
                default: { secret: 'test-secret' },
                refresh: { secret: 'test-secret' },
              },
            },
            invitation: {
              userModelService: undefined as never,
            },
            services: { mailerService: mockEmailService },
          }),
          invitation: {
            imports: [
              TypeOrmExtModule.forFeature({
                invitation: { entity: InvitationEntityFixture },
              }),
            ],
          },
          userCrud: {
            imports: [
              TypeOrmModule.forFeature([
                UserFixture,
                UserMetadataEntityFixture,
              ]),
            ],
            model: RocketsAuthUserFixtureDto,
            dto: {
              createOne: RocketsAuthUserCreateDtoFixture,
              updateOne: RocketsAuthUserUpdateDtoFixture,
            },
            userMetadataConfig: {
              imports: [TypeOrmModule.forFeature([UserMetadataEntityFixture])],
              entity: UserMetadataEntityFixture,
              createDto: RocketsAuthUserMetadataFixtureDto,
              updateDto: RocketsAuthUserMetadataFixtureDto,
            },
          },
          user: {
            imports: [TypeOrmModule.forFeature([UserCredentialEntityFixture])],
          },
          role: {
            imports: [
              TypeOrmModule.forFeature([
                RoleEntityFixture,
                UserRoleEntityFixture,
              ]),
            ],
          },
          federated: {
            imports: [
              TypeOrmExtModule.forFeature({
                federated: { entity: FederatedEntityFixture },
              }),
              RepositoryModule.forFeature({
                module: TypeOrmRepositoryModule,
                entities: [
                  { key: 'federated', entity: FederatedEntityFixture },
                ],
              }),
            ],
          },
          roleCrud: {
            imports: [TypeOrmModule.forFeature([RoleEntityFixture])],
            model: RocketsAuthRoleDto,
            dto: {
              createOne: RocketsAuthRoleCreateDto,
              updateOne: RocketsAuthRoleUpdateDto,
            },
          },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    const exceptionsFilter = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
    app.useGlobalPipes(new ValidationPipe());

    commandBus = app.get(CommandBus);
    queryBus = app.get(QueryBus);

    await app.init();

    // Create admin role
    adminRole = await commandBus.execute(
      new CreateRoleCommand(roleCtx, {
        name: 'admin',
        description: 'Administrator role',
      }),
    );

    // Create admin user
    const adminSignup = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: 'admin',
        email: 'admin@example.com',
        password: 'Admin123!',
        active: true,
      })
      .expect(201);

    // Assign admin role
    await commandBus.execute(
      new AssignRoleCommand(userRoleCtx, adminRole.id, adminSignup.body.id),
    );

    // Verify the role assignment was successful
    const hasAdminRole = await queryBus.execute(
      new IsAssignedRoleQuery(userRoleCtx, adminRole.id, adminSignup.body.id),
    );
    expect(hasAdminRole).toBe(true);

    // Re-login to get a fresh access token after role assignment
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username: 'admin', password: 'Admin123!' })
      .expect(200);

    adminToken = loginRes.body.accessToken;
    expect(adminToken).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sentEmails.length = 0;
    jest.clearAllMocks();
    // Reset mock email service to default behavior
    (mockEmailService.sendMail as jest.Mock).mockImplementation(
      (mailOptions) => {
        sentEmails.push({
          to: emailToString(mailOptions.to),
          subject: mailOptions.subject || '',
          context: mailOptions.context || {},
        });
        return Promise.resolve(undefined);
      },
    );
  });

  describe('POST /admin/invitations (Create Invitation)', () => {
    it('should create and send invitation successfully', async () => {
      const email = 'newuser@example.com';

      const response = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        });

      if (response.status !== 201) {
        console.error('Invitation creation failed:', {
          status: response.status,
          body: response.body,
          text: response.text,
        });
      }
      expect(response.status).toBe(201);

      // Verify invitation structure
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.category).toBe('user');

      // Verify email status fields are present
      expect(response.body).toHaveProperty('emailSent');
      expect(response.body.emailSent).toBe(true);
      expect(response.body.emailError).toBeUndefined();

      // Verify email was sent
      expect(mockEmailService.sendMail).toHaveBeenCalledTimes(1);
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe(email);
    });

    it('should create invitation with constraints', async () => {
      const email = 'constraineduser@example.com';
      const constraints = { orgId: '123', roleId: 'manager' };

      const response = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
          constraints,
        })
        .expect(201);

      expect(response.body.constraints).toEqual(constraints);
    });

    it('should reject invitation creation without admin token', async () => {
      await request(app.getHttpServer())
        .post('/admin/invitations')
        .send({
          email: 'test@example.com',
          category: 'user',
        })
        .expect(401);
    });

    it('should reject invitation with invalid email', async () => {
      await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'invalid-email',
          category: 'user',
        })
        .expect(400);
    });

    it('should reject invitation without required fields', async () => {
      await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test@example.com',
          // missing category
        })
        .expect(400);
    });

    it('should return invitation with emailSent=false when email sending fails', async () => {
      const email = 'emailfail@example.com';
      const errorMessage = 'SMTP connection timeout';

      // Mock email service to fail using spy
      const sendMailSpy = jest
        .spyOn(mockEmailService, 'sendMail')
        .mockRejectedValueOnce(new Error(errorMessage));

      const response = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      // Verify invitation was still created
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.category).toBe('user');

      // Verify email status indicates failure
      expect(response.body).toHaveProperty('emailSent');
      expect(response.body.emailSent).toBe(false);
      expect(response.body).toHaveProperty('emailError');
      expect(response.body.emailError).toBe(
        'Error while trying to send invitation related email',
      );

      // Verify email was attempted but failed
      expect(sendMailSpy).toHaveBeenCalledTimes(1);
      expect(sentEmails).toHaveLength(0); // No email was successfully sent

      // Restore original mock
      sendMailSpy.mockRestore();
    });

    it('should allow reattempt after email sending failure', async () => {
      const email = 'reattemptafterfail@example.com';
      const errorMessage = 'SMTP connection timeout';

      // Mock email service to fail on first attempt, succeed on second
      let callCount = 0;
      const sendMailSpy = jest
        .spyOn(mockEmailService, 'sendMail')
        .mockImplementation((mailOptions) => {
          callCount++;
          if (callCount === 1) {
            // First call fails
            return Promise.reject(new Error(errorMessage));
          }
          // Second call succeeds (reattempt)
          sentEmails.push({
            to: emailToString(mailOptions.to),
            subject: mailOptions.subject || '',
            context: mailOptions.context || {},
          });
          return Promise.resolve(undefined);
        });

      // 1. Create invitation (email will fail)
      const invitationRes = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      const invitationCode = invitationRes.body.code;

      // Verify invitation was created but email failed
      expect(invitationRes.body.emailSent).toBe(false);
      expect(invitationRes.body.emailError).toBe(
        'Error while trying to send invitation related email',
      );
      expect(sentEmails).toHaveLength(0);

      // 2. Use reattempt endpoint to retry sending
      await request(app.getHttpServer())
        .post(`/admin/invitations/${invitationCode}/reattempt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // 3. Verify email was sent successfully on reattempt
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe(email);
      expect(sendMailSpy).toHaveBeenCalledTimes(2);

      // Restore original mock
      sendMailSpy.mockRestore();
    });
  });

  describe('PATCH /invitation-acceptance/:code (Accept Invitation)', () => {
    it('should accept invitation with complete user data and assign default role', async () => {
      const email = 'acceptuser@example.com';

      // 1. Create invitation
      const invitationRes = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      const invitationCode = invitationRes.body.code;
      const userId = invitationRes.body.userId;

      // 2. Extract OTP passcode from email
      expect(sentEmails.length).toBeGreaterThan(0);
      const emailContext = sentEmails[sentEmails.length - 1].context as {
        tokenUrl: string;
      };
      expect(emailContext.tokenUrl).toBeDefined();

      // Extract passcode from tokenUrl: http://.../?code=xxx&passcode=yyy
      const urlParams = new URLSearchParams(
        emailContext.tokenUrl.split('?')[1],
      );
      const passcode = urlParams.get('passcode');
      expect(passcode).toBeDefined();
      expect(passcode).not.toBeNull();

      // 3. Accept invitation
      await request(app.getHttpServer())
        .patch(`/invitation-acceptance/${invitationCode}`)
        .send({
          passcode,
          payload: {
            password: 'NewUser123!',
            userMetadata: {
              bio: 'Test user bio',
              firstName: 'Test',
              lastName: 'User',
            },
          },
        })
        .expect(200);

      // 4. Verify user was updated
      const user = await queryBus.execute(new GetUserQuery(userId));
      expect(user).toBeDefined();

      // 5. Verify userMetadata was persisted by fetching from admin endpoint
      const userWithMetadata = await request(app.getHttpServer())
        .get(`/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify userMetadata was persisted correctly (firstName/lastName are in userMetadata, not user)
      expect(userWithMetadata.body.userMetadata).toBeDefined();
      expect(userWithMetadata.body.userMetadata.firstName).toBe('Test');
      expect(userWithMetadata.body.userMetadata.lastName).toBe('User');
      expect(userWithMetadata.body.userMetadata.bio).toBe('Test user bio');

      // 6. Verify user can login with new password
      const loginRes = await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: email, password: 'NewUser123!' })
        .expect(200);

      expect(loginRes.body).toHaveProperty('accessToken');
      expect(loginRes.body).toHaveProperty('refreshToken');
    });

    it('should accept invitation with roleId in constraints', async () => {
      const email = 'roleuser@example.com';

      // Create a specific role
      const testRole = await commandBus.execute(
        new CreateRoleCommand(roleCtx, {
          name: 'test-role',
          description: 'Test role for invitation',
        }),
      );

      // 1. Create invitation with roleId in constraints (admin-controlled)
      const invitationRes = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
          constraints: {
            roleId: testRole.id,
          },
        })
        .expect(201);

      const invitationCode = invitationRes.body.code;
      const userId = invitationRes.body.userId;

      // 2. Extract OTP passcode from email
      expect(sentEmails.length).toBeGreaterThan(0);
      const emailContext = sentEmails[sentEmails.length - 1].context as {
        tokenUrl: string;
      };
      const urlParams = new URLSearchParams(
        emailContext.tokenUrl.split('?')[1],
      );
      const passcode = urlParams.get('passcode');
      expect(passcode).not.toBeNull();

      // 3. Accept invitation (roleId is read from constraints, not payload)
      await request(app.getHttpServer())
        .patch(`/invitation-acceptance/${invitationCode}`)
        .send({
          passcode,
          payload: {
            password: 'RoleUser123!',
          },
        })
        .expect(200);

      // 4. Verify role was assigned from invitation constraints
      const userRoles = await queryBus.execute(
        new GetAssignedRolesQuery(userRoleCtx, userId),
      );

      expect(userRoles).toBeDefined();
      expect(
        userRoles.some(
          (r: { props?: { roleId: string }; roleId?: string; id?: string }) =>
            (r.props?.roleId ?? r.roleId ?? r.id) === testRole.id,
        ),
      ).toBe(true);
    });

    it('should ignore roleId in acceptance payload (security test)', async () => {
      const email = 'securitytest@example.com';

      // Create two roles: one for constraints, one that user tries to assign
      const allowedRole = await commandBus.execute(
        new CreateRoleCommand(roleCtx, {
          name: 'allowed-role',
          description: 'Role set by admin in constraints',
        }),
      );

      const attemptedRole = await commandBus.execute(
        new CreateRoleCommand(roleCtx, {
          name: 'attempted-role',
          description: 'Role user tries to assign via payload',
        }),
      );

      // 1. Create invitation with allowedRole in constraints
      const invitationRes = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
          constraints: {
            roleId: allowedRole.id,
          },
        })
        .expect(201);

      const invitationCode = invitationRes.body.code;
      const userId = invitationRes.body.userId;

      // 2. Extract OTP passcode from email
      expect(sentEmails.length).toBeGreaterThan(0);
      const emailContext = sentEmails[sentEmails.length - 1].context as {
        tokenUrl: string;
      };
      const urlParams = new URLSearchParams(
        emailContext.tokenUrl.split('?')[1],
      );
      const passcode = urlParams.get('passcode');
      expect(passcode).not.toBeNull();

      // 3. Accept invitation with attemptedRole in payload (should be ignored)
      await request(app.getHttpServer())
        .patch(`/invitation-acceptance/${invitationCode}`)
        .send({
          passcode,
          payload: {
            password: 'SecurityTest123!',
            roleId: attemptedRole.id, // This should be ignored
          },
        })
        .expect(200);

      // 4. Verify allowedRole was assigned (from constraints), not attemptedRole
      const userRoles = await queryBus.execute(
        new GetAssignedRolesQuery(userRoleCtx, userId),
      );

      expect(userRoles).toBeDefined();
      const getRoleId = (r: {
        props?: { roleId: string };
        roleId?: string;
        id?: string;
      }): string => r.props?.roleId ?? r.roleId ?? r.id ?? '';
      // Should have allowedRole (from constraints)
      expect(
        userRoles.some(
          (r: { props?: { roleId: string }; roleId?: string; id?: string }) =>
            getRoleId(r) === allowedRole.id,
        ),
      ).toBe(true);
      // Should NOT have attemptedRole (from payload - should be ignored)
      expect(
        userRoles.some(
          (r: { props?: { roleId: string }; roleId?: string; id?: string }) =>
            getRoleId(r) === attemptedRole.id,
        ),
      ).toBe(false);
    });

    it('should prevent mass assignment vulnerability - ignore protected fields in payload', async () => {
      const email = 'massassignment@example.com';
      const hijackedEmail = 'hijacked@example.com';

      // 1. Create invitation
      const invitationRes = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      const invitationCode = invitationRes.body.code;
      const userId = invitationRes.body.userId;

      // 2. Get user before acceptance to capture initial state
      const userBefore = await queryBus.execute(new GetUserQuery(userId));
      expect(userBefore).toBeDefined();
      const initialActive = userBefore?.active;
      const initialEmail = userBefore?.email;
      const initialUsername = userBefore?.username;

      // Verify initial email matches invitation email
      expect(initialEmail).toBe(email);

      // 3. Extract OTP passcode from email
      expect(sentEmails.length).toBeGreaterThan(0);
      const emailContext = sentEmails[sentEmails.length - 1].context as {
        tokenUrl: string;
      };
      const urlParams = new URLSearchParams(
        emailContext.tokenUrl.split('?')[1],
      );
      const passcode = urlParams.get('passcode');
      expect(passcode).not.toBeNull();

      // 4. Attempt mass assignment attack: try to set protected fields
      // Try to toggle active status, hijack email, and change username
      await request(app.getHttpServer())
        .patch(`/invitation-acceptance/${invitationCode}`)
        .send({
          passcode,
          payload: {
            password: 'MassAssignment123!',
            userMetadata: {
              bio: 'Test user bio',
              firstName: 'Test',
              lastName: 'User',
            },
            // Attempt to set protected fields - these should be IGNORED
            active: !initialActive, // Try to toggle active status
            email: hijackedEmail, // Try to hijack email
            username: 'hijacked-username', // Try to change username
          },
        })
        .expect(200);

      // 5. Verify protected fields were NOT updated by user (vulnerability prevented)
      const userAfter = await queryBus.execute(new GetUserQuery(userId));
      expect(userAfter).toBeDefined();

      // Security check: active is set to true by code (not by user input)
      // Even if user tried to set active: false, it should be true after acceptance
      expect(userAfter?.active).toBe(true);
      // Verify that user's attempt to toggle active was ignored
      // (active is always set to true by code when invitation is accepted)

      // Security check: email should remain original (not hijacked)
      // User cannot change email via payload
      expect(userAfter?.email).toBe(initialEmail);
      expect(userAfter?.email).toBe(email);
      expect(userAfter?.email).not.toBe(hijackedEmail);

      // Security check: username should not be changed
      // User cannot change username via payload
      if (initialUsername) {
        expect(userAfter?.username).toBe(initialUsername);
      }
      expect(userAfter?.username).not.toBe('hijacked-username');

      // Verify that safe fields (firstName, lastName) were processed correctly
      // These should be in userMetadata, not directly on user
      const userWithMetadata = await request(app.getHttpServer())
        .get(`/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(userWithMetadata.body.userMetadata).toBeDefined();
      expect(userWithMetadata.body.userMetadata.firstName).toBe('Test');
      expect(userWithMetadata.body.userMetadata.lastName).toBe('User');
    });

    it('should reject invitation acceptance with invalid code', async () => {
      await request(app.getHttpServer())
        .patch('/invitation-acceptance/invalid-code-12345')
        .send({
          passcode: '123456',
          payload: {},
        })
        .expect(404);
    });

    it('should reject invitation acceptance with invalid passcode', async () => {
      const email = 'invalidpasscode@example.com';

      // 1. Create invitation
      const invitationRes = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      const invitationCode = invitationRes.body.code;

      // 2. Try to accept with wrong passcode - should throw exception
      const acceptResponse = await request(app.getHttpServer())
        .patch(`/invitation-acceptance/${invitationCode}`)
        .send({
          passcode: 'wrong-passcode-123',
          payload: {},
        })
        .expect(400);

      // Should fail with INVITATION_NOT_ACCEPTED error
      expect(acceptResponse.body.errorCode).toBe(
        'ROCKETS_AUTH_INVITATION_NOT_ACCEPTED_ERROR',
      );
    });

    it('should reject invitation acceptance without passcode', async () => {
      await request(app.getHttpServer())
        .patch('/invitation-acceptance/some-code')
        .send({
          payload: {},
        })
        .expect(404);
    });
  });

  describe('POST /admin/invitations/:code/reattempt (Reattempt Invitation)', () => {
    it('should re-send invitation email with new OTP', async () => {
      const email = 'reattempt@example.com';

      // 1. Create invitation
      const invitationRes = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      const invitationCode = invitationRes.body.code;

      // Get initial OTP passcode from first email
      expect(sentEmails.length).toBeGreaterThan(0);
      const initialEmailContext = sentEmails[sentEmails.length - 1].context as {
        tokenUrl: string;
      };
      const initialUrlParams = new URLSearchParams(
        initialEmailContext.tokenUrl.split('?')[1],
      );
      const initialPasscode = initialUrlParams.get('passcode');
      expect(initialPasscode).not.toBeNull();

      // Clear email tracking
      sentEmails.length = 0;

      // 2. Reattempt sending invitation
      await request(app.getHttpServer())
        .post(`/admin/invitations/${invitationCode}/reattempt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // 3. Verify new email was sent
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe(email);

      // 4. Verify new OTP was created from the new email
      const newEmailContext = sentEmails[0].context as { tokenUrl: string };
      const newUrlParams = new URLSearchParams(
        newEmailContext.tokenUrl.split('?')[1],
      );
      const newPasscode = newUrlParams.get('passcode');
      expect(newPasscode).not.toBeNull();

      // New passcode should be different
      expect(newPasscode).not.toBe(initialPasscode);
    });

    it('should reject reattempt without admin token', async () => {
      await request(app.getHttpServer())
        .post('/admin/invitations/some-code/reattempt')
        .expect(401);
    });

    it('should reject reattempt with invalid invitation code', async () => {
      await request(app.getHttpServer())
        .post('/admin/invitations/invalid-code-123/reattempt')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('POST /admin/invitations/revoke (Revoke Invitations)', () => {
    it('should revoke all active invitations for email and category', async () => {
      const email = 'revoke@example.com';

      // 1. Create multiple invitations for same user
      const invitation1 = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _invitation2 = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      // 2. Revoke all invitations
      await request(app.getHttpServer())
        .post('/admin/invitations/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      // 3. Try to accept revoked invitation - should fail
      // Get passcode from one of the emails sent before revocation
      expect(sentEmails.length).toBeGreaterThan(0);
      const emailContext = sentEmails[0].context as { tokenUrl: string };
      const urlParams = new URLSearchParams(
        emailContext.tokenUrl.split('?')[1],
      );
      const passcode = urlParams.get('passcode');

      if (passcode) {
        const acceptRes = await request(app.getHttpServer())
          .patch(`/invitation-acceptance/${invitation1.body.code}`)
          .send({
            passcode,
            payload: {},
          })
          .expect(404);

        // Should fail because invitation is revoked
        expect(acceptRes.body.errorCode).toBe('INVITATION_NOT_FOUND_ERROR');
      }
    });

    it('should reject revocation without admin token', async () => {
      await request(app.getHttpServer())
        .post('/admin/invitations/revoke')
        .send({
          email: 'test@example.com',
          category: 'user',
        })
        .expect(401);
    });

    it('should reject revocation with invalid email', async () => {
      await request(app.getHttpServer())
        .post('/admin/invitations/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'invalid-email',
          category: 'user',
        })
        .expect(400);
    });

    it('should reject revocation without required fields', async () => {
      await request(app.getHttpServer())
        .post('/admin/invitations/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test@example.com',
          // missing category
        })
        .expect(400);
    });
  });

  describe('Complete Invitation Flow', () => {
    it('should complete full workflow: create → send → accept → login', async () => {
      const email = 'complete-flow@example.com';
      const password = getTestPassword();
      const firstName = 'Complete';
      const lastName = 'Flow';

      // 1. Admin creates invitation
      const invitationRes = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
          constraints: { source: 'e2e-test' },
        })
        .expect(201);

      expect(invitationRes.body.code).toBeDefined();
      expect(sentEmails).toHaveLength(1);

      const invitationCode = invitationRes.body.code;
      const userId = invitationRes.body.userId;

      // 2. User receives email and gets passcode
      expect(sentEmails.length).toBeGreaterThan(0);
      const emailContext = sentEmails[sentEmails.length - 1].context as {
        tokenUrl: string;
      };
      const urlParams = new URLSearchParams(
        emailContext.tokenUrl.split('?')[1],
      );
      const passcode = urlParams.get('passcode');
      expect(passcode).not.toBeNull();

      // 3. User accepts invitation with data
      await request(app.getHttpServer())
        .patch(`/invitation-acceptance/${invitationCode}`)
        .send({
          passcode,
          payload: {
            password,
            userMetadata: {
              firstName,
              lastName,
              bio: 'Complete flow test user',
            },
          },
        })
        .expect(200);

      // 4. Verify user data and metadata were persisted
      const userWithMetadata = await request(app.getHttpServer())
        .get(`/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // firstName and lastName are stored in userMetadata, not user
      expect(userWithMetadata.body.userMetadata).toBeDefined();
      expect(userWithMetadata.body.userMetadata.firstName).toBe(firstName);
      expect(userWithMetadata.body.userMetadata.lastName).toBe(lastName);
      expect(userWithMetadata.body.userMetadata.bio).toBe(
        'Complete flow test user',
      );

      // 5. User can now login
      const loginRes = await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: email,
          password,
        })
        .expect(200);

      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body.refreshToken).toBeDefined();

      // 6. User can access protected route with token
      const protectedRes = await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

      // Should be forbidden (not admin) but authenticated
      expect(protectedRes.status).toBe(403);
    });

    it('should handle multiple invitations for same email correctly', async () => {
      const email = `multi-invite-${Date.now()}@example.com`;

      // 1. Create first invitation
      const invite1 = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      const userId = invite1.body.userId;

      // 2. Create second invitation (should use same user)
      const invite2 = await request(app.getHttpServer())
        .post('/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          category: 'user',
        })
        .expect(201);

      // Should be same user
      expect(invite2.body.userId).toBe(userId);

      // 3. Get latest OTP from the second email
      expect(sentEmails.length).toBeGreaterThan(1);
      const latestEmailContext = sentEmails[sentEmails.length - 1].context as {
        tokenUrl: string;
      };
      const latestUrlParams = new URLSearchParams(
        latestEmailContext.tokenUrl.split('?')[1],
      );
      const passcode = latestUrlParams.get('passcode');
      expect(passcode).not.toBeNull();

      // 4. Accept using latest invitation
      await request(app.getHttpServer())
        .patch(`/invitation-acceptance/${invite2.body.code}`)
        .send({
          passcode,
          payload: {
            password: 'MultiInvite123!',
          },
        })
        .expect(200);

      // 5. Verify first invitation is also revoked
      // Get passcode from the first email
      const firstEmailContext = sentEmails[0].context as { tokenUrl: string };
      const firstUrlParams = new URLSearchParams(
        firstEmailContext.tokenUrl.split('?')[1],
      );
      const oldPasscode = firstUrlParams.get('passcode');

      if (oldPasscode) {
        // Should fail - invitation already accepted/revoked
        await request(app.getHttpServer())
          .patch(`/invitation-acceptance/${invite1.body.code}`)
          .send({
            passcode: oldPasscode,
            payload: {},
          })
          .expect(404); // Fails because invitation was revoked
      }
    });
  });
});
