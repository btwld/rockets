import { FirebaseTokenVerifierService } from '../services/firebase-token-verifier.service';
import * as firebaseAdminAuthUtils from '../utils/resolve-firebase-admin-auth.util';

describe(FirebaseTokenVerifierService.name, () => {
  it('delegates to firebase-admin auth() and forwards `checkRevoked`', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({
      uid: 'fb-1',
      email: 'a@b.com',
      iat: 1234,
    });
    const fakeApp = { auth: () => ({ verifyIdToken }) };

    const verifier = new FirebaseTokenVerifierService(fakeApp);

    const decoded = await verifier.verifyIdToken('a.b.c', {
      checkRevoked: true,
    });

    expect(verifyIdToken).toHaveBeenCalledWith('a.b.c', true);
    expect(decoded.uid).toBe('fb-1');
    expect(decoded.sub).toBe('fb-1');
    expect(decoded.email).toBe('a@b.com');
  });

  it('defaults `checkRevoked` to false when not supplied', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: 'fb-1' });
    const fakeApp = { auth: () => ({ verifyIdToken }) };

    const verifier = new FirebaseTokenVerifierService(fakeApp);

    await verifier.verifyIdToken('a.b.c');

    expect(verifyIdToken).toHaveBeenCalledWith('a.b.c', false);
  });

  it('uses getAuth() for modular firebase-admin/app instances', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: 'modular-1' });
    const resolveAuthSpy = jest
      .spyOn(firebaseAdminAuthUtils, 'resolveFirebaseAdminAuth')
      .mockReturnValue({ verifyIdToken });

    const modularApp = { name: '[DEFAULT]' };
    const verifier = new FirebaseTokenVerifierService(modularApp);

    const decoded = await verifier.verifyIdToken('a.b.c');

    expect(resolveAuthSpy).toHaveBeenCalledWith(modularApp);
    expect(verifyIdToken).toHaveBeenCalledWith('a.b.c', false);
    expect(decoded.uid).toBe('modular-1');

    resolveAuthSpy.mockRestore();
  });

  it('propagates firebase-admin errors verbatim', async () => {
    const fakeApp = {
      auth: () => ({
        verifyIdToken: jest.fn().mockRejectedValue(
          Object.assign(new Error('expired'), {
            code: 'auth/id-token-expired',
          }),
        ),
      }),
    };

    const verifier = new FirebaseTokenVerifierService(fakeApp);

    await expect(verifier.verifyIdToken('expired.jwt')).rejects.toMatchObject({
      code: 'auth/id-token-expired',
    });
  });
});
