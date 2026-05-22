/**
 * Regression test pair for G9 (`.context/upstream-gaps.md`).
 *
 * The two tests are intentionally adjacent so the bug + workaround are
 * self-documenting: anyone removing `RocketsValidateCurrentPasswordHandler`
 * (or `RocketsValidateCurrentPasswordOverrideModule`) immediately sees the
 * upstream behavior they would re-expose.
 *
 * - **Test 1 (bug demonstration):** the upstream `PasswordCreationService.validateCurrent`
 *   does `{ password, ...target }`. When `target` is a v8 aggregate that exposes
 *   `passwordHash` via a getter on the prototype (not as an own enumerable
 *   property), the spread silently drops the field. bcrypt then compares
 *   the supplied password against `undefined` and returns `false` for a
 *   valid password.
 *
 * - **Test 2 (workaround in action):** our `RocketsValidateCurrentPasswordHandler`
 *   normalizes the target via `toPlain()` / `.props` / direct property read
 *   into a plain `PasswordStorageInterface` before delegating to the same
 *   upstream service. Same input, correct result.
 *
 * When upstream ships the spread fix:
 *   1. Test 1 will flip to returning `true` (delete it; the assertion
 *      becomes meaningless and would silently hide future regressions).
 *   2. Test 2 stays useful as a structural-contract test until the override
 *      module is removed.
 */
import {
  PasswordCreationService,
  PasswordStorageService,
  PasswordStrengthService,
  PasswordValidationService,
  PasswordPolicy,
  ValidateCurrentPasswordCommand,
} from '@concepta/nestjs-password';

import { RocketsValidateCurrentPasswordHandler } from './rockets-validate-current-password.handler';

// --- Fixtures ---------------------------------------------------------

/**
 * Mimics the shape of a v8 `UserCredentials` aggregate:
 * `passwordHash` is exposed as a **prototype getter** plus a `toPlain()`
 * snapshot — neither of which survives `{ ...target }`.
 */
class AggregateLikeCredential {
  // Stored privately on the instance; the getter is on the prototype.
  constructor(private readonly _passwordHash: string) {}

  get passwordHash(): string {
    return this._passwordHash;
  }

  toPlain(): { passwordHash: string } {
    return { passwordHash: this._passwordHash };
  }
}

function buildPasswordCreationService(): PasswordCreationService {
  const policy = new PasswordPolicy({
    minPasswordStrength: 0,
    requireCurrentToUpdate: false,
  });
  const storage = new PasswordStorageService();
  const validation = new PasswordValidationService();
  const strength = new PasswordStrengthService(policy);
  return new PasswordCreationService(policy, storage, validation, strength);
}

// --- Tests ------------------------------------------------------------

describe('G9 — validateCurrent aggregate-spread bug', () => {
  const plainPassword = 'CorrectHorseBatteryStaple1!';
  let service: PasswordCreationService;
  let aggregate: AggregateLikeCredential;

  beforeAll(async () => {
    service = buildPasswordCreationService();
    const stored = await new PasswordStorageService().hash(plainPassword);
    aggregate = new AggregateLikeCredential(stored.passwordHash);
  });

  it('Sanity — upstream `validateCurrent` returns true when given a plain POJO target', async () => {
    // Baseline so the next test isn't blamed on hash/strength config.
    const pojo = { passwordHash: aggregate.passwordHash };
    const result = await service.validateCurrent({
      password: plainPassword,
      target: pojo,
    });
    expect(result).toBe(true);
  });

  it('BUG — upstream `validateCurrent` throws when target is an aggregate (passwordHash via getter)', async () => {
    // Exact same hash, exact same plain password — only the target shape
    // differs. The spread `{password, ...target}` drops the prototype
    // getter and bcrypt then receives `hash: undefined` and throws
    // `data and hash arguments required` — surfacing as HTTP 500 in
    // production at the `PATCH /me/password` endpoint.
    await expect(
      service.validateCurrent({
        password: plainPassword,
        target: aggregate as unknown as { passwordHash: string },
      }),
    ).rejects.toThrow(/data and hash arguments required/);
  });

  it('FIX — RocketsValidateCurrentPasswordHandler normalizes the aggregate and validates correctly', async () => {
    // Same aggregate that the upstream service silently rejected above.
    const handler = new RocketsValidateCurrentPasswordHandler(service);
    const command = new ValidateCurrentPasswordCommand(
      plainPassword,
      aggregate as unknown as { passwordHash: string },
    );
    const result = await handler.execute(command);
    expect(result).toBe(true); // Correctly validates the right password.
  });

  it('FIX — RocketsValidateCurrentPasswordHandler also rejects a wrong password against the same aggregate', async () => {
    const handler = new RocketsValidateCurrentPasswordHandler(service);
    const command = new ValidateCurrentPasswordCommand(
      'totally-wrong-password',
      aggregate as unknown as { passwordHash: string },
    );
    const result = await handler.execute(command);
    expect(result).toBe(false); // Proves the fix isn't just blanket-accepting.
  });
});
