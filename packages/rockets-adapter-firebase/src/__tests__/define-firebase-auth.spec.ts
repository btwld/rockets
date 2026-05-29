import {
  ROCKETS_AUTH_INTEGRATION_KIND,
  defineModuleResource,
  isRocketsAuthIntegration,
} from '@bitwild/rockets-core';

import { FirebaseAuthAdapter } from '../adapters/firebase-auth.adapter';
import { defineFirebaseAuth } from '../integration/define-firebase-auth';
import { FirebaseAuthModule } from '../modules/firebase-auth.module';
import { FirebaseTokenVerifierInterface } from '../interfaces/firebase-token-verifier.interface';
import { FirebaseDecodedTokenInterface } from '../interfaces/firebase-decoded-token.interface';

class FakeVerifier implements FirebaseTokenVerifierInterface {
  async verifyIdToken(): Promise<FirebaseDecodedTokenInterface> {
    return { uid: 'fake', sub: 'fake' };
  }
}

class FakeEntity {}

describe('defineFirebaseAuth', () => {
  it('produces a RocketsAuthIntegration with the FirebaseAuthAdapter and a single global nestImport (sync path)', () => {
    const integration = defineFirebaseAuth({
      forRoot: { verifier: FakeVerifier },
    });

    expect(isRocketsAuthIntegration(integration)).toBe(true);
    expect(integration.kind).toBe(ROCKETS_AUTH_INTEGRATION_KIND);
    expect(integration.authAdapter).toBe(FirebaseAuthAdapter);
    expect(integration.nestImports).toHaveLength(1);
    // `FirebaseAuthModule.forRoot` always returns `global: true`; this
    // guards against accidental regressions in the helper that strip it.
    expect(integration.nestImports[0]?.global).toBe(true);
    expect(integration.nestImports[0]?.module).toBe(FirebaseAuthModule);
    expect(integration.resources).toEqual([]);
  });

  it('accepts async options and forwards them to FirebaseAuthModule.forRootAsync', () => {
    const integration = defineFirebaseAuth({
      forRootAsync: {
        useFactory: () => ({ verifier: FakeVerifier }),
      },
    });

    expect(integration.kind).toBe(ROCKETS_AUTH_INTEGRATION_KIND);
    expect(integration.authAdapter).toBe(FirebaseAuthAdapter);
    expect(integration.nestImports).toHaveLength(1);
    expect(integration.nestImports[0]?.module).toBe(FirebaseAuthModule);
  });

  it('forwards caller-supplied resources verbatim', () => {
    const userResource = defineModuleResource({ entities: [FakeEntity] });
    const integration = defineFirebaseAuth({
      forRoot: { verifier: FakeVerifier },
      resources: [userResource],
    });

    expect(integration.resources).toEqual([userResource]);
  });
});
