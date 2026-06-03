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

describe('defineFirebaseAuth', () => {
  it('returns AuthBootstrap with FirebaseAuthAdapter and forRoot (sync path)', () => {
    const bootstrap = defineFirebaseAuth({
      forRoot: { verifier: FakeVerifier },
    });

    expect(bootstrap.adapter).toBe(FirebaseAuthAdapter);
    expect(bootstrap.forRoot).toBeDefined();

    const dynamicModule = bootstrap.forRoot!();
    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.module).toBe(FirebaseAuthModule);
  });

  it('accepts async options and forwards them to FirebaseAuthModule.forRootAsync', () => {
    const bootstrap = defineFirebaseAuth({
      forRootAsync: {
        useFactory: () => ({ verifier: FakeVerifier }),
      },
    });

    expect(bootstrap.adapter).toBe(FirebaseAuthAdapter);
    const dynamicModule = bootstrap.forRoot!();
    expect(dynamicModule.module).toBe(FirebaseAuthModule);
  });
});
