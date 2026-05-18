import {
  isRocketsAuthIntegration,
  ROCKETS_AUTH_INTEGRATION_KIND,
} from './rockets-auth-integration';

describe('isRocketsAuthIntegration', () => {
  it('returns true for a minimal valid integration object', () => {
    const integration = {
      kind: ROCKETS_AUTH_INTEGRATION_KIND,
      nestImports: [],
      authAdapter: class TestAdapter {},
      resources: [],
    };
    expect(isRocketsAuthIntegration(integration)).toBe(true);
  });

  it('returns false when kind is auth-feature bundle', () => {
    expect(
      isRocketsAuthIntegration({
        kind: 'auth-feature',
        nestImports: [],
        authAdapter: class P {},
        resources: [],
      }),
    ).toBe(false);
  });

  it('returns false for bare adapter class', () => {
    expect(isRocketsAuthIntegration(class Adapter {})).toBe(false);
  });

  it('returns false for null and primitives', () => {
    expect(isRocketsAuthIntegration(null)).toBe(false);
    expect(isRocketsAuthIntegration(undefined)).toBe(false);
    expect(isRocketsAuthIntegration('x')).toBe(false);
    expect(isRocketsAuthIntegration(1)).toBe(false);
  });

  it('returns false when kind string is wrong', () => {
    expect(
      isRocketsAuthIntegration({
        kind: 'other',
        nestImports: [],
        authAdapter: class A {},
        resources: [],
      }),
    ).toBe(false);
  });
});
