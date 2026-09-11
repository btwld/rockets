import {
  vi,
  type Mocked,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import type { PlainLiteralObject } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { InvitationInterface } from '@concepta/nestjs-invitation';
import { ReferenceIdInterface } from '@concepta/nestjs-core';
import { TransactionScope } from '@concepta/rockets-core';

import { RocketsAuthSetPasswordPortCommand } from '../../../shared/authentication/rockets-auth-password-port.commands';
import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
} from '../../../shared/ports/rockets-auth-user-port.service';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  ROCKETS_AUTH_OTP_ASSIGNMENT,
} from '../../../shared/constants/rockets-auth.constants';
import { InvitationAcceptanceDataInterface } from '../interfaces/invitation-acceptance-data.interface';
import { RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN } from '../modules/rockets-auth-invitation-acceptance.module-definition';
import { RocketsAuthInvitationAcceptanceModule } from '../modules/rockets-auth-invitation-acceptance.module';
import { AssignDefaultRoleCommand } from '../../user/application/commands/impl/assign-default-role.command';
import { SaveUserMetadataCommand } from '../../user/application/commands/impl/save-user-metadata.command';
import {
  INVITATION_USER_ONBOARDING_SERVICE_TOKEN,
  InvitationUserOnboardingService,
  type InvitationUserOnboardingServiceInterface,
} from '../application/services/invitation-user-onboarding.service';
import { RocketsAuthInvitationUserMissingException } from '../domain/exceptions/invitation.exception';

describe(InvitationUserOnboardingService.name, () => {
  let onboarding: InvitationUserOnboardingService;
  let mockUserPortService: Mocked<
    Pick<RocketsAuthUserPortService, 'byId' | 'update'>
  >;
  let mockCommandBus: Mocked<Pick<CommandBus, 'execute'>>;

  /** Stands in for the transaction context the accept handler forwards. */
  const ctx: PlainLiteralObject = { tx: 'outer' };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    active: false,
  };

  const mockInvitation: ReferenceIdInterface & InvitationInterface = {
    id: 'invitation-123',
    code: 'abc-123',
    userId: 'user-123',
    category: 'user',
    constraints: {},
    dateAccepted: null,
    dateRevoked: null,
  };

  const mockSettings = {
    role: {
      adminRoleName: 'admin',
      defaultUserRoleName: 'user',
    },
    email: {
      from: 'noreply@example.com',
      baseUrl: 'http://localhost:3000',
      templates: {
        sendOtp: { fileName: 'send-otp.template.hbs', subject: 'OTP' },
        invitation: {
          logo: '',
          fileName: 'invitation.template.hbs',
          subject: 'Invitation',
        },
        invitationAccepted: {
          logo: '',
          fileName: 'invitation-accepted.template.hbs',
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
  };

  function accept(
    data?: InvitationAcceptanceDataInterface,
    invitation: ReferenceIdInterface & InvitationInterface = mockInvitation,
  ): Promise<void> {
    return onboarding.onAccepted(ctx, invitation as never, data);
  }

  beforeEach(async () => {
    mockUserPortService = {
      byId: vi.fn(),
      update: vi.fn(),
    } as Mocked<Pick<RocketsAuthUserPortService, 'byId' | 'update'>>;

    mockCommandBus = {
      execute: vi.fn(),
    } as Mocked<Pick<CommandBus, 'execute'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ROCKETS_AUTH_USER_PORT_TOKEN,
          useValue: mockUserPortService,
        },
        { provide: CommandBus, useValue: mockCommandBus },
        {
          provide: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
          useValue: mockSettings,
        },
        { provide: RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN, useValue: {} },
        // The module also provides RocketsAcceptInvitationHandler, which is
        // not under test here but has to resolve for the module to compile.
        { provide: TransactionScope, useValue: { run: vi.fn() } },
        ...(RocketsAuthInvitationAcceptanceModule.forRoot({}).providers || []),
      ],
    }).compile();

    onboarding = module.get<InvitationUserOnboardingService>(
      InvitationUserOnboardingService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('onAccepted', () => {
    it('skips processing for non-user category invitations', async () => {
      await accept({}, { ...mockInvitation, category: 'org' });

      expect(mockUserPortService.byId).not.toHaveBeenCalled();
    });

    it('forwards the caller context, so its work joins the acceptance transaction', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await accept({ password: 'Test123!' });

      expect(mockUserPortService.byId).toHaveBeenCalledWith(ctx, 'user-123');
      expect(mockUserPortService.update).toHaveBeenCalledWith(ctx, {
        id: 'user-123',
        active: true,
      });
      const setPassword = mockCommandBus.execute.mock.calls.find(
        (call: unknown[]) =>
          call[0] instanceof RocketsAuthSetPasswordPortCommand,
      );
      expect(setPassword).toBeDefined();
      expect(setPassword![0]).toEqual(expect.objectContaining({ ctx }));
    });

    it('activates and sets the password through the credentials port', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await accept({ password: 'Test123!', firstName: 'John' });

      // v8 keeps the password in user credentials: never on the user row.
      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(RocketsAuthSetPasswordPortCommand),
      );
      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(AssignDefaultRoleCommand),
      );
    });

    it('processes an invitation with no password', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await accept({ firstName: 'John' });

      expect(mockCommandBus.execute).not.toHaveBeenCalledWith(
        expect.any(RocketsAuthSetPasswordPortCommand),
      );
      expect(mockUserPortService.update).toHaveBeenCalledWith(ctx, {
        id: 'user-123',
        active: true,
      });
    });

    // The module is registered WITHOUT `userCrud.userMetadataConfig`
    // (see `forRoot({})` above): the acceptance path must then fall back to
    // the base update schema, which strips every key — the same deny-by-
    // default signup and admin apply. Before the fallback existed the raw
    // record went straight to `SaveUserMetadataCommand`, and on the update
    // branch a smuggled `userId` rewrote the row's owner.
    it('strips every key of userMetadata when no update schema is configured', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await accept({
        password: 'Test123!',
        userMetadata: {
          userId: 'someone-else',
          bio: 'Test bio',
          phoneNumber: '+1234567890',
        },
      });

      const metadataCall = mockCommandBus.execute.mock.calls.find(
        (call: unknown[]) => call[0] instanceof SaveUserMetadataCommand,
      );
      expect(metadataCall).toBeDefined();
      expect(metadataCall![0]).toEqual(
        expect.objectContaining({ userId: 'user-123', data: {} }),
      );
    });

    it('ignores a roleId smuggled in the acceptance payload', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await accept(
        { password: 'Test123!', roleId: 'user-role-456' },
        { ...mockInvitation, constraints: { roleId: 'admin-role-123' } },
      );

      const assign = mockCommandBus.execute.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { roleId?: string })?.roleId !== undefined,
      );
      expect(assign![0]).toEqual(
        expect.objectContaining({ roleId: 'admin-role-123' }),
      );
    });

    it('assigns the default role when constraints carry none', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await accept({ password: 'Test123!' });

      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(AssignDefaultRoleCommand),
      );
    });

    it('handles an empty and an undefined payload', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await accept({});
      await accept(undefined);

      expect(mockCommandBus.execute).not.toHaveBeenCalledWith(
        expect.any(RocketsAuthSetPasswordPortCommand),
      );
    });
  });

  // The point of running inside the acceptance transaction: every one of
  // these used to be caught and logged by the old post-commit listener,
  // which left the invitation marked accepted and the account inactive —
  // and re-accepting answers 409, so the invitee had no way back.
  describe('failures propagate so the acceptance rolls back', () => {
    it('throws when the invited user is gone', async () => {
      mockUserPortService.byId.mockResolvedValue(null as never);

      await expect(accept({ password: 'Test123!' })).rejects.toBeInstanceOf(
        RocketsAuthInvitationUserMissingException,
      );
      expect(mockUserPortService.update).not.toHaveBeenCalled();
    });

    it('throws when activation fails', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockRejectedValue(new Error('Update failed'));

      await expect(accept({ password: 'Test123!' })).rejects.toThrow(
        'Update failed',
      );
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });

    it('throws when setting the password fails', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockImplementation(async (command: unknown) => {
        if (command instanceof RocketsAuthSetPasswordPortCommand) {
          throw new Error('Password set failed');
        }
      });

      await expect(accept({ password: 'Test123!' })).rejects.toThrow(
        'Password set failed',
      );
      // Role assignment comes after the password: nothing past it runs.
      expect(mockCommandBus.execute).not.toHaveBeenCalledWith(
        expect.any(AssignDefaultRoleCommand),
      );
    });

    it('throws when role assignment fails', async () => {
      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockRejectedValue(
        new Error('Role assignment failed'),
      );

      await expect(accept({ password: 'Test123!' })).rejects.toThrow(
        'Role assignment failed',
      );
    });
  });

  describe('onboardingService override', () => {
    it('uses the supplied class for the shared token', async () => {
      @Injectable()
      class CustomOnboarding
        implements InvitationUserOnboardingServiceInterface
      {
        async onAccepted(): Promise<void> {}
      }

      const customModule = await Test.createTestingModule({
        providers: [
          {
            provide: ROCKETS_AUTH_USER_PORT_TOKEN,
            useValue: mockUserPortService,
          },
          { provide: CommandBus, useValue: mockCommandBus },
          {
            provide: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
            useValue: mockSettings,
          },
          { provide: RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN, useValue: {} },
          { provide: TransactionScope, useValue: { run: vi.fn() } },
          ...(RocketsAuthInvitationAcceptanceModule.forRoot({
            onboardingService: CustomOnboarding,
          }).providers || []),
        ],
      }).compile();

      const resolved =
        customModule.get<InvitationUserOnboardingServiceInterface>(
          INVITATION_USER_ONBOARDING_SERVICE_TOKEN,
        );

      await resolved.onAccepted(ctx, mockInvitation as never, {
        password: 'Test123!',
      });

      expect(resolved).toBeInstanceOf(CustomOnboarding);
      expect(mockUserPortService.byId).not.toHaveBeenCalled();
    });
  });
});
