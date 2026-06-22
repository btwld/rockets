import { resolveEntityKey } from './resolve-entity-key.util';

describe('resolveEntityKey', () => {
  it('passes through explicit string keys unchanged', () => {
    expect(resolveEntityKey('billing/invoice')).toBe('billing/invoice');
  });

  it('derives keys from entity classes via deriveEntityKey', () => {
    class UserEntity {}
    expect(resolveEntityKey(UserEntity)).toBe('user');
  });
});
