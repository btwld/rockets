import {
  USER_MODULE_USER_ENTITY_KEY,
  UserModelService,
} from './user.constants';

describe('user.constants (e2e coverage)', () => {
  it('exposes stable DI tokens', () => {
    expect(USER_MODULE_USER_ENTITY_KEY).toBe('user');
    expect(UserModelService).toBe('USER_MODULE_USER_SERVICE_KEY');
  });
});
