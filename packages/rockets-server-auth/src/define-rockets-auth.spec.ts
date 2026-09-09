import { describe, expect, it, vi } from 'vitest';
import type { CanActivate } from '@nestjs/common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import { createServer } from '@concepta/rockets';
import { JwtGuard } from '@concepta/nestjs-authentication';
import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

import {
  defineRocketsAuth,
  type DefineRocketsAuthInput,
} from './define-rockets-auth';
import { RocketsAuthModule } from './rockets-auth.module';
import type { RocketsAuthOptionsInterface } from './shared/interfaces/rockets-auth-options.interface';
import { ROCKETS_AUTH_OTP_ASSIGNMENT } from './shared/constants/rockets-auth.constants';
import { UserFixture } from './__fixtures__/user/user.entity.fixture';
import { UserCredentialEntityFixture } from './__fixtures__/user/user-credential.entity.fixture';

class UserMetadataEntity {}
const userMetadataUpdateSchema = withOpenApi(
  z.object({}),
  'SpecUserMetadataUpdateDto',
);
const userMetadataResponseSchema = withOpenApi(
  z.object({ id: z.string() }),
  'SpecUserMetadataResponseDto',
);

const repository = {
  name: 'test-repository',
  forFeature: vi.fn(),
} as unknown as RepositoryModuleInterface;

/** Minimal but complete options: the module is never booted here. */
function minimalOptions(): RocketsAuthOptionsInterface {
  return {
    services: { mailerService: { sendMail: async () => undefined } },
    settings: {
      role: { adminRoleName: 'admin' },
      email: {
        from: 'test@test.com',
        baseUrl: 'http://localhost',
        templates: {
          sendOtp: { fileName: 'otp.hbs', subject: 'OTP' },
          invitation: { logo: '', fileName: 'inv.hbs', subject: 'Invitation' },
          invitationAccepted: {
            logo: '',
            fileName: 'inv-acc.hbs',
            subject: 'Accepted',
          },
        },
      },
      otp: {
        assignment: ROCKETS_AUTH_OTP_ASSIGNMENT,
        category: 'test',
        type: 'uuid',
        expiresIn: '1h',
      },
    },
  };
}

function input(
  rocketsDefaults?: DefineRocketsAuthInput['rocketsDefaults'],
): DefineRocketsAuthInput {
  return {
    persistence: {
      module: repository,
      entities: {
        user: UserFixture,
        userCredentials: UserCredentialEntityFixture,
      },
    },
    userMetadata: {
      entity: UserMetadataEntity,
      updateSchema: userMetadataUpdateSchema,
      responseSchema: userMetadataResponseSchema,
    },
    userCrud: {},
    useFactory: minimalOptions,
    rocketsDefaults,
  };
}

describe('defineRocketsAuth', () => {
  it('defaults the Rockets guard off because built-in auth owns a JWT app guard', () => {
    const bootstrap = defineRocketsAuth(input());

    expect(bootstrap.contributes?.enableGlobalGuard).toBe(false);
  });

  it('normalizes mixed-auth hosts to one Rockets-owned global guard', () => {
    const forRootAsync = vi
      .spyOn(RocketsAuthModule, 'forRootAsync')
      .mockReturnValue({ module: RocketsAuthModule });
    const bootstrap = defineRocketsAuth(input({ enableGlobalGuard: true }));

    expect(bootstrap.contributes?.enableGlobalGuard).toBe(true);
    expect(bootstrap.contributes?.providesAppGuard).toBe(false);

    bootstrap.forRoot?.();

    expect(forRootAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ appGuard: false }),
      }),
    );
    forRootAsync.mockRestore();
  });

  it('rejects an explicit upstream app guard when Rockets owns the chain', () => {
    const competingAppGuard: CanActivate = { canActivate: () => true };

    expect(() =>
      defineRocketsAuth({
        ...input({ enableGlobalGuard: true }),
        auth: { appGuard: competingAppGuard },
      }),
    ).toThrow(/one global authentication guard|appGuard/);
  });

  it('claims identity ownership over the auth-owned persistence', () => {
    const bootstrap = defineRocketsAuth(input());

    expect(bootstrap.identity?.userMetadata).toBeDefined();
    expect(bootstrap.identity?.repository).toBe(repository);
    expect(bootstrap.identity?.resources?.length).toBeGreaterThan(0);
  });

  it('declares the upstream JwtGuard as the replacement app guard', () => {
    const bootstrap = defineRocketsAuth(input());

    expect(bootstrap.contributes?.providesAppGuard).toBe(true);
  });

  it('withdraws the guard declaration when the host disables the upstream guard', () => {
    const bootstrap = defineRocketsAuth({
      ...input(),
      auth: { appGuard: false },
    });

    expect(bootstrap.contributes?.providesAppGuard).toBe(false);
  });

  it('fails server composition when both guard layers end up disabled', () => {
    // appGuard: false removes the upstream JwtGuard; without
    // rocketsDefaults.enableGlobalGuard: true nothing guards the app —
    // the server invariant must reject this half-configured state.
    const halfConfigured = defineRocketsAuth({
      ...input(),
      auth: { appGuard: false },
    });

    expect(() => createServer({ auth: halfConfigured })).toThrow(
      /providesAppGuard|enableGlobalGuard/,
    );
  });
});

describe('defineRocketsAuth — contributed auth guards', () => {
  it('contributes upstream JwtGuard by default', () => {
    const bootstrap = defineRocketsAuth(input());
    expect(bootstrap.contributes?.authGuards).toEqual([JwtGuard]);
  });

  it('contributes the constructor of a custom appGuard instance', () => {
    class CustomGuard implements CanActivate {
      canActivate(): boolean {
        return true;
      }
    }
    const bootstrap = defineRocketsAuth({
      ...input(),
      auth: { appGuard: new CustomGuard() },
    });
    expect(bootstrap.contributes?.authGuards).toEqual([CustomGuard]);
  });

  it('contributes nothing when the upstream guard is disabled', () => {
    const bootstrap = defineRocketsAuth({
      ...input({ enableGlobalGuard: true }),
      auth: { appGuard: false },
    });
    expect(bootstrap.contributes?.authGuards).toEqual([]);
  });
});
