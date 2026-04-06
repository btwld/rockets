import {
  USER_MODULE_USER_ENTITY_KEY,
  UserModelService,
} from './user.constants';

describe('user.constants', () => {
  it('exports stable DI keys for the user module', () => {
    expect(USER_MODULE_USER_ENTITY_KEY).toBe('user');
    expect(UserModelService).toBe('USER_MODULE_USER_SERVICE_KEY');
  });
});
