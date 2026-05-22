import { Test, TestingModule } from '@nestjs/testing';

import {
  FIREBASE_AUTH_MODULE_OPTIONS_TOKEN,
  FIREBASE_TOKEN_VERIFIER_TOKEN,
  FIREBASE_USER_RESOLVER_TOKEN,
} from '../constants/firebase-auth.constants';
import { FirebaseAuthAdapter } from '../adapters/firebase-auth.adapter';
import { FirebaseAuthException } from '../exceptions/firebase-auth.exception';
import {
  FirebaseTokenInvalidException,
  FirebaseTokenMissingSubjectException,
  FirebaseTokenRevokedException,
} from '../exceptions/firebase-token-invalid.exception';
import { FirebaseAuthModuleOptions } from '../interfaces/firebase-auth-options.interface';
import { FirebaseDecodedTokenInterface } from '../interfaces/firebase-decoded-token.interface';
import {
  FirebaseTokenVerifierInterface,
  FirebaseVerifyOptions,
} from '../interfaces/firebase-token-verifier.interface';
import { FirebaseUserResolverInterface } from '../interfaces/firebase-user-resolver.interface';
import { DefaultFirebaseUserResolverService } from '../services/default-firebase-user-resolver.service';

class StubVerifier implements FirebaseTokenVerifierInterface {
  constructor(
    private readonly behavior:
      | { kind: 'resolve'; token: FirebaseDecodedTokenInterface }
      | { kind: 'reject'; error: unknown },
  ) {}

  async verifyIdToken(
    _token: string,
    _options?: FirebaseVerifyOptions,
  ): Promise<FirebaseDecodedTokenInterface> {
    if (this.behavior.kind === 'reject') {
      throw this.behavior.error;
    }
    return this.behavior.token;
  }
}

class ExplodingResolver implements FirebaseUserResolverInterface {
  async resolve(): Promise<never> {
    throw new Error('local user lookup failed');
  }
}

async function makeAdapter(opts: {
  verifier: FirebaseTokenVerifierInterface;
  resolver?: FirebaseUserResolverInterface;
  options?: Partial<FirebaseAuthModuleOptions>;
}): Promise<FirebaseAuthAdapter> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      FirebaseAuthAdapter,
      {
        provide: FIREBASE_TOKEN_VERIFIER_TOKEN,
        useValue: opts.verifier,
      },
      {
        provide: FIREBASE_USER_RESOLVER_TOKEN,
        useValue: opts.resolver ?? new DefaultFirebaseUserResolverService(),
      },
      {
        provide: FIREBASE_AUTH_MODULE_OPTIONS_TOKEN,
        useValue: {
          firebaseApp: {},
          checkRevoked: false,
          ...opts.options,
        } satisfies FirebaseAuthModuleOptions,
      },
    ],
  }).compile();

  return moduleRef.get(FirebaseAuthAdapter);
}

describe(FirebaseAuthAdapter.name, () => {
  describe('input validation', () => {
    it('rejects empty token without calling verifier', async () => {
      const verify = jest.fn();
      const adapter = await makeAdapter({
        verifier: { verifyIdToken: verify } as FirebaseTokenVerifierInterface,
      });

      await expect(adapter.validateToken('')).rejects.toBeInstanceOf(
        FirebaseTokenInvalidException,
      );
      expect(verify).not.toHaveBeenCalled();
    });

    it('rejects non-string token without calling verifier', async () => {
      const verify = jest.fn();
      const adapter = await makeAdapter({
        verifier: { verifyIdToken: verify } as FirebaseTokenVerifierInterface,
      });

      // Cast through unknown — the public contract is string, the
      // guard exists for runtime garbage that bypasses TS.
      await expect(
        adapter.validateToken(undefined as unknown as string),
      ).rejects.toBeInstanceOf(FirebaseTokenInvalidException);
      expect(verify).not.toHaveBeenCalled();
    });
  });

  describe('verifier failures', () => {
    it('maps a generic verify failure to FirebaseTokenInvalidException', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'reject',
          error: Object.assign(new Error('expired'), {
            code: 'auth/id-token-expired',
          }),
        }),
      });

      await expect(adapter.validateToken('expired.jwt')).rejects.toBeInstanceOf(
        FirebaseTokenInvalidException,
      );
    });

    it('maps `auth/id-token-revoked` to FirebaseTokenRevokedException', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'reject',
          error: Object.assign(new Error('revoked'), {
            code: 'auth/id-token-revoked',
          }),
        }),
      });

      await expect(adapter.validateToken('revoked.jwt')).rejects.toBeInstanceOf(
        FirebaseTokenRevokedException,
      );
    });

    it('handles non-Error rejections from the verifier', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'reject',
          error: 'something went wrong',
        }),
      });

      await expect(adapter.validateToken('bad.jwt')).rejects.toBeInstanceOf(
        FirebaseTokenInvalidException,
      );
    });

    it('forwards `checkRevoked` from module options to the verifier', async () => {
      const verifyIdToken = jest.fn().mockResolvedValue({
        uid: 'user-1',
        sub: 'user-1',
      });
      const verifier: FirebaseTokenVerifierInterface = { verifyIdToken };

      const adapter = await makeAdapter({
        verifier,
        options: { checkRevoked: true },
      });

      await adapter.validateToken('good.jwt');

      expect(verifyIdToken).toHaveBeenCalledWith('good.jwt', {
        checkRevoked: true,
      });
    });
  });

  describe('decoded token validation', () => {
    it('throws FirebaseTokenMissingSubjectException when decoded token has no uid', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'resolve',
          token: {
            // Intentionally missing `uid` to exercise the guard.
            uid: '',
            sub: '',
          },
        }),
      });

      await expect(adapter.validateToken('no-uid.jwt')).rejects.toBeInstanceOf(
        FirebaseTokenMissingSubjectException,
      );
    });
  });

  describe('user resolver', () => {
    it('returns the AuthorizedUser when everything is happy', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'resolve',
          token: {
            uid: 'fb-uid-123',
            sub: 'fb-uid-123',
            email: 'jane@example.com',
            email_verified: true,
            roles: ['user', 'editor'],
          },
        }),
      });

      const user = await adapter.validateToken('valid.jwt');

      expect(user.id).toBe('fb-uid-123');
      expect(user.sub).toBe('fb-uid-123');
      expect(user.email).toBe('jane@example.com');
      expect(user.userRoles).toEqual([
        { role: { name: 'user' } },
        { role: { name: 'editor' } },
      ]);
      expect(user.claims).toMatchObject({
        uid: 'fb-uid-123',
        email: 'jane@example.com',
      });
    });

    it('omits email when the token does not carry one', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'resolve',
          token: { uid: 'anon-1', sub: 'anon-1' },
        }),
      });

      const user = await adapter.validateToken('valid.jwt');
      expect(user).not.toHaveProperty('email');
      expect(user.userRoles).toEqual([]);
    });

    it('wraps unknown resolver failures in FirebaseAuthException', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'resolve',
          token: { uid: 'u-1', sub: 'u-1' },
        }),
        resolver: new ExplodingResolver(),
      });

      const thrown = await adapter.validateToken('valid.jwt').catch((e) => e);
      expect(thrown).toBeInstanceOf(FirebaseAuthException);
      // Original cause is preserved for logging/debugging.
      expect((thrown as FirebaseAuthException).cause).toBeInstanceOf(Error);
    });

    it('lets FirebaseAuthException from the resolver propagate as-is', async () => {
      class TenantMismatch extends FirebaseAuthException {
        constructor() {
          super('user belongs to a different tenant');
        }
      }
      class TenantResolver implements FirebaseUserResolverInterface {
        async resolve(): Promise<never> {
          throw new TenantMismatch();
        }
      }

      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'resolve',
          token: { uid: 'u-2', sub: 'u-2' },
        }),
        resolver: new TenantResolver(),
      });

      await expect(adapter.validateToken('valid.jwt')).rejects.toBeInstanceOf(
        TenantMismatch,
      );
    });
  });
});
