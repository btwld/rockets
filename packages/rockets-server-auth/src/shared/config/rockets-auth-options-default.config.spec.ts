import { rocketsAuthOptionsDefaultConfig } from './rockets-auth-options-default.config';

describe('rocketsAuthOptionsDefaultConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falls back to "admin" / "user" role names when env vars unset', () => {
    delete process.env.ADMIN_ROLE_NAME;
    delete process.env.DEFAULT_USER_ROLE_NAME;
    const cfg = rocketsAuthOptionsDefaultConfig();
    expect(cfg.role).toEqual({
      adminRoleName: 'admin',
      defaultUserRoleName: 'user',
    });
  });

  it('reads ADMIN_ROLE_NAME and DEFAULT_USER_ROLE_NAME from env', () => {
    process.env.ADMIN_ROLE_NAME = 'super';
    process.env.DEFAULT_USER_ROLE_NAME = 'member';
    const cfg = rocketsAuthOptionsDefaultConfig();
    expect(cfg.role).toEqual({
      adminRoleName: 'super',
      defaultUserRoleName: 'member',
    });
  });

  it('exposes default OTP settings', () => {
    const cfg = rocketsAuthOptionsDefaultConfig();
    expect(cfg.otp).toMatchObject({
      category: 'auth-login',
      type: 'uuid',
      expiresIn: '1h',
    });
  });

  it('exposes email template and tokenUrlFormatter', () => {
    const cfg = rocketsAuthOptionsDefaultConfig();
    expect(cfg.email?.templates).toBeDefined();
    expect(cfg.email?.tokenUrlFormatter?.('https://x', 'CODE')).toBe(
      'https://x/CODE',
    );
  });
});
