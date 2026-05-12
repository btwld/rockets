import { ResourceKind } from './resource-kind.enum';

describe('ResourceKind enum', () => {
  it('exposes the three discriminator values', () => {
    expect(ResourceKind.Crud).toBe('crud');
    expect(ResourceKind.Module).toBe('module');
    expect(ResourceKind.Sub).toBe('sub');
  });

  it('values are pairwise distinct', () => {
    const values = [ResourceKind.Crud, ResourceKind.Module, ResourceKind.Sub];
    expect(new Set(values).size).toBe(values.length);
  });
});
