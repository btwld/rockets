import {
  USER_MODULE_USER_ENTITY_KEY,
  UserModelService,
  USER_METADATA_MODULE_ENTITY_KEY,
} from './rockets.constants';

describe('rockets.constants (e2e coverage)', () => {
  it('exposes stable DI tokens', () => {
    expect(USER_MODULE_USER_ENTITY_KEY).toBe('user');
    expect(UserModelService).toBe('USER_MODULE_USER_SERVICE_KEY');
    expect(USER_METADATA_MODULE_ENTITY_KEY).toBe('userMetadata');
  });
});
