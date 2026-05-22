import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  FIREBASE_AUTH_MODULE_OPTIONS_TOKEN,
  FIREBASE_TOKEN_VERIFIER_TOKEN,
  FIREBASE_USER_RESOLVER_TOKEN,
} from '../constants/firebase-auth.constants';
import { FirebaseAuthAdapter } from '../adapters/firebase-auth.adapter';
import { FirebaseAuthModule } from '../modules/firebase-auth.module';
import { FirebaseDecodedTokenInterface } from '../interfaces/firebase-decoded-token.interface';
import { FirebaseTokenVerifierInterface } from '../interfaces/firebase-token-verifier.interface';
import { FirebaseUserResolverInterface } from '../interfaces/firebase-user-resolver.interface';
import { DefaultFirebaseUserResolverService } from '../services/default-firebase-user-resolver.service';
import { AuthorizedUser } from '@bitwild/rockets-core';

class FakeVerifier implements FirebaseTokenVerifierInterface {
  async verifyIdToken(): Promise<FirebaseDecodedTokenInterface> {
    return { uid: 'fake', sub: 'fake' };
  }
}

class CustomResolver implements FirebaseUserResolverInterface {
  async resolve(): Promise<AuthorizedUser> {
    return {
      id: 'custom-id',
      sub: 'custom-id',
      userRoles: [{ role: { name: 'admin' } }],
    };
  }
}

@Injectable()
class ResolverDependency {
  readonly userId = 'injected-id';
}

@Injectable()
class InjectedResolver implements FirebaseUserResolverInterface {
  constructor(private readonly dependency: ResolverDependency) {}

  async resolve(): Promise<AuthorizedUser> {
    return {
      id: this.dependency.userId,
      sub: this.dependency.userId,
      userRoles: [],
    };
  }
}

@Module({
  providers: [ResolverDependency],
  exports: [ResolverDependency],
})
class ResolverDependencyModule {}

describe(FirebaseAuthModule.name, () => {
  it('throws at bootstrap when neither `firebaseApp` nor `verifier` is provided', () => {
    expect(() => FirebaseAuthModule.forRoot({})).toThrow(
      /firebaseApp.*verifier/i,
    );
  });

  it('wires the default verifier (firebase-admin wrapper) when only `firebaseApp` is provided', async () => {
    const fakeApp = { auth: () => ({ verifyIdToken: jest.fn() }) };

    const moduleRef = await Test.createTestingModule({
      imports: [FirebaseAuthModule.forRoot({ firebaseApp: fakeApp })],
    }).compile();

    expect(moduleRef.get(FirebaseAuthAdapter)).toBeInstanceOf(
      FirebaseAuthAdapter,
    );
    expect(moduleRef.get(FIREBASE_TOKEN_VERIFIER_TOKEN)).toBeDefined();
    expect(moduleRef.get(FIREBASE_USER_RESOLVER_TOKEN)).toBeInstanceOf(
      DefaultFirebaseUserResolverService,
    );
    expect(moduleRef.get(FIREBASE_AUTH_MODULE_OPTIONS_TOKEN)).toEqual({
      firebaseApp: fakeApp,
    });
  });

  it('prefers a custom `verifier` class over `firebaseApp`', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirebaseAuthModule.forRoot({
          firebaseApp: { auth: () => ({ verifyIdToken: jest.fn() }) },
          verifier: FakeVerifier,
        }),
      ],
    }).compile();

    expect(moduleRef.get(FIREBASE_TOKEN_VERIFIER_TOKEN)).toBeInstanceOf(
      FakeVerifier,
    );
  });

  it('wires a custom `userResolver` when supplied', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirebaseAuthModule.forRoot({
          verifier: FakeVerifier,
          userResolver: CustomResolver,
        }),
      ],
    }).compile();

    const resolver = moduleRef.get<FirebaseUserResolverInterface>(
      FIREBASE_USER_RESOLVER_TOKEN,
    );
    const user = await resolver.resolve({ uid: 'ignored', sub: 'ignored' });
    expect(user.id).toBe('custom-id');
  });

  it('resolves a custom `userResolver` class with injected dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirebaseAuthModule.forRoot({
          imports: [ResolverDependencyModule],
          verifier: FakeVerifier,
          userResolver: InjectedResolver,
        }),
      ],
    }).compile();

    const resolver = moduleRef.get<FirebaseUserResolverInterface>(
      FIREBASE_USER_RESOLVER_TOKEN,
    );
    const user = await resolver.resolve({ uid: 'ignored', sub: 'ignored' });
    expect(user.id).toBe('injected-id');
  });

  it('wires async options from `useFactory`', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirebaseAuthModule.forRootAsync({
          useFactory: async () => ({
            verifier: FakeVerifier,
            userResolver: CustomResolver,
          }),
        }),
      ],
    }).compile();

    const adapter = moduleRef.get(FirebaseAuthAdapter);
    const user = await adapter.validateToken('any.jwt');

    expect(user.id).toBe('custom-id');
  });

  it('produces a working adapter end-to-end through the module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FirebaseAuthModule.forRoot({
          verifier: FakeVerifier,
        }),
      ],
    }).compile();

    const adapter = moduleRef.get(FirebaseAuthAdapter);
    const user = await adapter.validateToken('any.jwt');

    expect(user.id).toBe('fake');
    expect(user.sub).toBe('fake');
  });

  it('returns a `global: true` dynamic module so downstream modules can inject FirebaseAuthAdapter without importing FirebaseAuthModule directly', () => {
    // Regression guard: aliasing `AUTH_ADAPTER_TOKEN` → `FirebaseAuthAdapter`
    // happens in the root composition (RocketsCoreModule), which does
    // NOT import FirebaseAuthModule. If `global` is dropped, the
    // alias provider fails to resolve `FirebaseAuthAdapter` at boot
    // with `Nest can't resolve dependencies` — surfaced live in the
    // sample-server e2e suite (`sample-server-firebase.e2e-spec.ts`).
    const dynModule = FirebaseAuthModule.forRoot({ verifier: FakeVerifier });
    expect(dynModule.global).toBe(true);
  });
});
