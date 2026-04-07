import {
  USER_MODULE_USER_ENTITY_KEY,
  UserModelService,
  USER_METADATA_MODULE_ENTITY_KEY,
} from './rockets.constants';

describe('rockets.constants', () => {
  it('exports stable DI keys for the user module', () => {
    expect(USER_MODULE_USER_ENTITY_KEY).toBe('user');
    expect(UserModelService).toBe('USER_MODULE_USER_SERVICE_KEY');
  });

  it('exports stable DI key for user metadata', () => {
    expect(USER_METADATA_MODULE_ENTITY_KEY).toBe('userMetadata');
  });
});
