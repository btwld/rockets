import { Test, TestingModule } from '@nestjs/testing';
import type { AuthRequest } from '@bitwild/rockets-core';

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

function makeRequest(authorization?: string): AuthRequest {
  return {
    headers: authorization !== undefined ? { authorization } : {},
    query: {},
    raw: {},
  };
}

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
  describe('no credential', () => {
    it('returns matched: false when no Authorization header is present', async () => {
      const verify = jest.fn();
      const adapter = await makeAdapter({
        verifier: { verifyIdToken: verify } as FirebaseTokenVerifierInterface,
      });

      const result = await adapter.authenticate(makeRequest());
      expect(result).toEqual({ matched: false });
      expect(verify).not.toHaveBeenCalled();
    });

    it('returns matched: false when Authorization header uses a non-Bearer scheme', async () => {
      const verify = jest.fn();
      const adapter = await makeAdapter({
        verifier: { verifyIdToken: verify } as FirebaseTokenVerifierInterface,
      });

      const result = await adapter.authenticate(
        makeRequest('Basic dXNlcjpwYXNz'),
      );
      expect(result).toEqual({ matched: false });
      expect(verify).not.toHaveBeenCalled();
    });

    it('returns matched: false for an empty Bearer value', async () => {
      const verify = jest.fn();
      const adapter = await makeAdapter({
        verifier: { verifyIdToken: verify } as FirebaseTokenVerifierInterface,
      });

      const result = await adapter.authenticate(makeRequest('Bearer '));
      expect(result).toEqual({ matched: false });
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

      const result = await adapter.authenticate(
        makeRequest('Bearer expired.jwt'),
      );
      expect(result).toMatchObject({ matched: true });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBeInstanceOf(FirebaseTokenInvalidException);
      }
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

      const result = await adapter.authenticate(
        makeRequest('Bearer revoked.jwt'),
      );
      expect(result).toMatchObject({ matched: true });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBeInstanceOf(FirebaseTokenRevokedException);
      }
    });

    it('handles non-Error rejections from the verifier', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'reject',
          error: 'something went wrong',
        }),
      });

      const result = await adapter.authenticate(makeRequest('Bearer bad.jwt'));
      expect(result).toMatchObject({ matched: true });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBeInstanceOf(FirebaseTokenInvalidException);
      }
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

      await adapter.authenticate(makeRequest('Bearer good.jwt'));

      expect(verifyIdToken).toHaveBeenCalledWith('good.jwt', {
        checkRevoked: true,
      });
    });
  });

  describe('decoded token validation', () => {
    it('returns FirebaseTokenMissingSubjectException when decoded token has no uid', async () => {
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

      const result = await adapter.authenticate(
        makeRequest('Bearer no-uid.jwt'),
      );
      expect(result).toMatchObject({ matched: true });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBeInstanceOf(
          FirebaseTokenMissingSubjectException,
        );
      }
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

      const result = await adapter.authenticate(
        makeRequest('Bearer valid.jwt'),
      );
      expect(result).toMatchObject({ matched: true });
      expect('user' in result).toBe(true);
      if ('user' in result) {
        expect(result.user.id).toBe('fb-uid-123');
        expect(result.user.sub).toBe('fb-uid-123');
        expect(result.user.email).toBe('jane@example.com');
        expect(result.user.userRoles).toEqual([
          { role: { name: 'user' } },
          { role: { name: 'editor' } },
        ]);
        expect(result.user.claims).toMatchObject({
          uid: 'fb-uid-123',
          email: 'jane@example.com',
        });
      }
    });

    it('omits email when the token does not carry one', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'resolve',
          token: { uid: 'anon-1', sub: 'anon-1' },
        }),
      });

      const result = await adapter.authenticate(
        makeRequest('Bearer valid.jwt'),
      );
      expect(result).toMatchObject({ matched: true });
      expect('user' in result).toBe(true);
      if ('user' in result) {
        expect(result.user).not.toHaveProperty('email');
        expect(result.user.userRoles).toEqual([]);
      }
    });

    it('wraps unknown resolver failures in FirebaseAuthException', async () => {
      const adapter = await makeAdapter({
        verifier: new StubVerifier({
          kind: 'resolve',
          token: { uid: 'u-1', sub: 'u-1' },
        }),
        resolver: new ExplodingResolver(),
      });

      const result = await adapter.authenticate(
        makeRequest('Bearer valid.jwt'),
      );
      expect(result).toMatchObject({ matched: true });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBeInstanceOf(FirebaseAuthException);
        expect((result.error as FirebaseAuthException).cause).toBeInstanceOf(
          Error,
        );
      }
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

      const result = await adapter.authenticate(
        makeRequest('Bearer valid.jwt'),
      );
      expect(result).toMatchObject({ matched: true });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBeInstanceOf(TenantMismatch);
      }
    });
  });
});
