/**
 * Integration e2e: loads the full `rockets-server-auth` user domain barrel.
 * Jest runs this file **last** via `scripts/jest-e2e-barrel-last-sequencer.cjs`: the
 * barrel import registers many CQRS handlers globally and would break subsequent
 * Nest apps in the same Node process if executed earlier in the e2e suite.
 */
import * as UserDomain from '../../rockets-server-auth/src/domains/user/index';

describe('Integration: @bitwild/rockets-server-auth user domain barrel', () => {
  it('exposes public commands, events, and modules for host wiring', () => {
    expect(UserDomain.RemoveUserCommand).toBeDefined();
    expect(UserDomain.AdminDeleteUserCommand).toBeDefined();
    expect(UserDomain.AdminUpdateUserCommand).toBeDefined();
    expect(UserDomain.GenericUserMetadataModelService).toBeDefined();
    expect(UserDomain.UserSignedUpEvent).toBeDefined();
    expect(UserDomain.UserUpdatedEvent).toBeDefined();
    expect(UserDomain.RocketsAuthAdminModule).toBeDefined();
  });
});
