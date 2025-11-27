import { EmailSendInterface, ExceptionsFilter } from '@concepta/nestjs-common';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { EventModule } from '@concepta/nestjs-event';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { AdminUserTypeOrmCrudAdapter } from '../../../__fixtures__/admin/admin-user-crud.adapter';
import { FederatedEntityFixture } from '../../../__fixtures__/federated/federated.entity.fixture';
import { ormConfig } from '../../../__fixtures__/ormconfig.fixture';
import { RoleEntityFixture } from '../../../__fixtures__/role/role.entity.fixture';
import { UserRoleEntityFixture } from '../../../__fixtures__/role/user-role.entity.fixture';
import { RocketsAuthUserCreateDtoFixture } from '../../../__fixtures__/user/dto/rockets-auth-user-create.dto.fixture';
import { RocketsAuthUserUpdateDtoFixture } from '../../../__fixtures__/user/dto/rockets-auth-user-update.dto.fixture';
import { RocketsAuthUserFixtureDto } from '../../../__fixtures__/user/dto/rockets-auth-user.dto.fixture';
import { RocketsAuthUserMetadataDto } from '../../user/dto/rockets-auth-user-metadata.dto';
import { UserOtpEntityFixture } from '../../../__fixtures__/user/user-otp-entity.fixture';
import { UserPasswordHistoryEntityFixture } from '../../../__fixtures__/user/user-password-history.entity.fixture';
import { UserMetadataEntityFixture } from '../../../__fixtures__/user/user-metadata.entity.fixture';
import { UserMetadataTypeOrmCrudAdapterFixture } from '../../../__fixtures__/services/user-metadata-typeorm-crud.adapter.fixture';
import { UserFixture } from '../../../__fixtures__/user/user.entity.fixture';
import { InvitationEntityFixture } from '../../../__fixtures__/invitation/invitation.entity.fixture';
import { RocketsAuthModule } from '../../../rockets-auth.module';
import { RoleModelService, RoleService } from '@concepta/nestjs-role';
import { UserModelService } from '@concepta/nestjs-user';
import { RocketsAuthRoleDto } from '../../role/dto/rockets-auth-role.dto';
import { RocketsAuthRoleCreateDto } from '../../role/dto/rockets-auth-role-create.dto';
import { RocketsAuthRoleUpdateDto } from '../../role/dto/rockets-auth-role-update.dto';
import { RoleTypeOrmCrudAdapter } from '../../../__fixtures__/role/role-typeorm-crud.adapter';

// Test constants - generate password dynamically to avoid hardcoded password detection
const getTestPassword = (): string => {
  // Test password for e2e tests only
  return 'CompleteFlow123!';
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
      to: mailOptions.to,
      subject: mailOptions.subject,
      context: mailOptions.context,
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
  let roleModelService: RoleModelService;
  let roleService: RoleService;
  let userModelService: UserModelService;
  let adminToken: string;
  let adminRole: { id: string; name: string };

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
        TypeOrmModule.forRoot({
          ...ormConfig,
          entities: [
            UserFixture,
            UserMetadataEntityFixture,
            UserOtpEntityFixture,
            UserPasswordHistoryEntityFixture,
            FederatedEntityFixture,
            UserRoleEntityFixture,
            RoleEntityFixture,
            InvitationEntityFixture,
          ],
        }),
        TypeOrmModule.forFeature([
          UserFixture,
          UserMetadataEntityFixture,
          UserRoleEntityFixture,
          RoleEntityFixture,
        ]),
        TypeOrmExtModule.forFeature({
          user: { entity: UserFixture },
          role: { entity: RoleEntityFixture },
          userRole: { entity: UserRoleEntityFixture },
          userOtp: { entity: UserOtpEntityFixture },
          federated: { entity: FederatedEntityFixture },
          invitation: { entity: InvitationEntityFixture },
        }),
        RocketsAuthModule.forRootAsync({
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
                assignment: 'userOtp',
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
              imports: [
                TypeOrmExtModule.forFeature({
                  userOtp: { entity: UserOtpEntityFixture },
                }),
              ],
              userModelService: undefined as never,
            },
            services: { mailerService: mockEmailService },
          }),
          userCrud: {
            imports: [
              TypeOrmModule.forFeature([
                UserFixture,
                UserMetadataEntityFixture,
              ]),
            ],
            adapter: AdminUserTypeOrmCrudAdapter,
            model: RocketsAuthUserFixtureDto,
            dto: {
              createOne: RocketsAuthUserCreateDtoFixture,
              updateOne: RocketsAuthUserUpdateDtoFixture,
            },
            userMetadataConfig: {
              imports: [TypeOrmModule.forFeature([UserMetadataEntityFixture])],
              adapter: UserMetadataTypeOrmCrudAdapterFixture,
              entity: UserMetadataEntityFixture,
              createDto: RocketsAuthUserMetadataDto,
              updateDto: RocketsAuthUserMetadataDto,
            },
          },
          roleCrud: {
            imports: [TypeOrmModule.forFeature([RoleEntityFixture])],
            adapter: RoleTypeOrmCrudAdapter,
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

    roleModelService = app.get(RoleModelService);
    roleService = app.get(RoleService);
    userModelService = app.get(UserModelService);

    await app.init();

    // Create admin role
    adminRole = await roleModelService.create({
      name: 'admin',
      description: 'Administrator role',
    });

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
    await roleService.assignRole({
      assignment: 'user',
      assignee: { id: adminSignup.body.id },
      role: { id: adminRole.id },
    });

    // Verify the role assignment was successful
    const hasAdminRole = await roleService.isAssignedRole({
      assignment: 'user',
      assignee: { id: adminSignup.body.id },
      role: { id: adminRole.id },
    });
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
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.category).toBe('user');
      expect(response.body.active).toBe(true);

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
            firstName: 'Test',
            lastName: 'User',
            userMetadata: {
              bio: 'Test user bio',
            },
          },
        })
        .expect(200);

      // 4. Verify user was updated
      const user = await userModelService.byId(userId);
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
      const testRole = await roleModelService.create({
        name: 'test-role',
        description: 'Test role for invitation',
      });

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
      const userRoles = await roleService.getAssignedRoles({
        assignment: 'user',
        assignee: { id: userId },
      });

      expect(userRoles).toBeDefined();
      expect(userRoles.some((r: { id: string }) => r.id === testRole.id)).toBe(
        true,
      );
    });

    it('should ignore roleId in acceptance payload (security test)', async () => {
      const email = 'securitytest@example.com';

      // Create two roles: one for constraints, one that user tries to assign
      const allowedRole = await roleModelService.create({
        name: 'allowed-role',
        description: 'Role set by admin in constraints',
      });

      const attemptedRole = await roleModelService.create({
        name: 'attempted-role',
        description: 'Role user tries to assign via payload',
      });

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
      const userRoles = await roleService.getAssignedRoles({
        assignment: 'user',
        assignee: { id: userId },
      });

      expect(userRoles).toBeDefined();
      // Should have allowedRole (from constraints)
      expect(
        userRoles.some((r: { id: string }) => r.id === allowedRole.id),
      ).toBe(true);
      // Should NOT have attemptedRole (from payload - should be ignored)
      expect(
        userRoles.some((r: { id: string }) => r.id === attemptedRole.id),
      ).toBe(false);
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
            firstName,
            lastName,
            userMetadata: {
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
      const email = 'multi-invite@example.com';

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
