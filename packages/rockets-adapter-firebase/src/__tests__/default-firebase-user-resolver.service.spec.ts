import { DefaultFirebaseUserResolverService } from '../services/default-firebase-user-resolver.service';

describe(DefaultFirebaseUserResolverService.name, () => {
  const resolver = new DefaultFirebaseUserResolverService();

  it('maps uid to both `id` and `sub`', async () => {
    const user = await resolver.resolve({ uid: 'u-1', sub: 'u-1' });
    expect(user.id).toBe('u-1');
    expect(user.sub).toBe('u-1');
  });

  it('hydrates `userRoles` from the `roles` custom claim', async () => {
    const user = await resolver.resolve({
      uid: 'u-1',
      sub: 'u-1',
      roles: ['user', 'manager'],
    });
    expect(user.userRoles).toEqual([
      { role: { name: 'user' } },
      { role: { name: 'manager' } },
    ]);
  });

  it('returns empty `userRoles` when claim is missing', async () => {
    const user = await resolver.resolve({ uid: 'u-1', sub: 'u-1' });
    expect(user.userRoles).toEqual([]);
  });

  it('filters out non-string entries from the `roles` claim', async () => {
    const user = await resolver.resolve({
      uid: 'u-1',
      sub: 'u-1',
      roles: ['ok', 42, null, 'still-ok', undefined],
    });
    expect(user.userRoles).toEqual([
      { role: { name: 'ok' } },
      { role: { name: 'still-ok' } },
    ]);
  });

  it('ignores a non-array `roles` claim', async () => {
    const user = await resolver.resolve({
      uid: 'u-1',
      sub: 'u-1',
      roles: 'admin',
    });
    expect(user.userRoles).toEqual([]);
  });

  it('preserves the full decoded token under `claims`', async () => {
    const user = await resolver.resolve({
      uid: 'u-1',
      sub: 'u-1',
      email: 'a@b.com',
      tenant_id: 'tenant-7',
    });
    expect(user.claims).toMatchObject({
      uid: 'u-1',
      email: 'a@b.com',
      tenant_id: 'tenant-7',
    });
  });
});
