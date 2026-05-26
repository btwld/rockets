import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../../domain/interfaces/auth-adapter.interface';
import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';
import { defineAuthFeature, isAuthFeatureBundle } from './define-auth-feature';

class TestUserEntity {
  id!: string;
  email!: string;
}

class TestController {}

class ExtraProvider {}

class TestAuthAdapter implements AuthAdapterInterface {
  async authenticate(_request: AuthRequest): Promise<AuthAttemptResult> {
    return {
      matched: true,
      user: { id: 'u-1', email: 'u@test.dev', sub: 'u-1' },
    };
  }
}

describe('defineAuthFeature', () => {
  it('returns the adapter class as `provider`, typed against the concrete generic', () => {
    const bundle = defineAuthFeature({
      entities: [TestUserEntity],
      adapter: TestAuthAdapter,
    });

    expect(bundle.provider).toBe(TestAuthAdapter);
  });

  it('builds a `ModuleResource` with the entity registered under a derived key', () => {
    const bundle = defineAuthFeature({
      entities: [TestUserEntity],
      adapter: TestAuthAdapter,
    });

    expect(bundle.resource.kind).toBe(ResourceKind.Module);
    expect(bundle.resource.entities).toHaveLength(1);
    expect(bundle.resource.entities[0]).toEqual({
      key: 'testUser',
      entity: TestUserEntity,
    });
  });

  it('always includes the adapter in `providers` AND `exports` (alias target stays globally injectable)', () => {
    const bundle = defineAuthFeature({
      entities: [TestUserEntity],
      adapter: TestAuthAdapter,
    });

    expect(bundle.resource.providers).toContain(TestAuthAdapter);
    expect(bundle.resource.exports).toContain(TestAuthAdapter);
  });

  it('forwards optional controllers / extra providers / extra exports without dropping the adapter', () => {
    const bundle = defineAuthFeature({
      entities: [TestUserEntity],
      adapter: TestAuthAdapter,
      controllers: [TestController],
      providers: [ExtraProvider],
      exports: [ExtraProvider],
    });

    expect(bundle.resource.controllers).toEqual([TestController]);
    expect(bundle.resource.providers).toEqual([TestAuthAdapter, ExtraProvider]);
    expect(bundle.resource.exports).toEqual([TestAuthAdapter, ExtraProvider]);
  });

  it('accepts multiple entities and forwards all of them to the underlying ModuleResource', () => {
    class TestSessionEntity {
      id!: string;
    }

    const bundle = defineAuthFeature({
      entities: [TestUserEntity, TestSessionEntity],
      adapter: TestAuthAdapter,
    });

    expect(bundle.resource.entities).toHaveLength(2);
    expect(bundle.resource.entities[0]).toEqual({
      key: 'testUser',
      entity: TestUserEntity,
    });
    expect(bundle.resource.entities[1]).toEqual({
      key: 'testSession',
      entity: TestSessionEntity,
    });
  });

  it('accepts the explicit `{ key, entity, repository? }` shape alongside class shorthand', () => {
    class CustomKeyEntity {
      id!: string;
    }

    const bundle = defineAuthFeature({
      entities: [
        TestUserEntity,
        { key: 'auth-token', entity: CustomKeyEntity },
      ],
      adapter: TestAuthAdapter,
    });

    expect(bundle.resource.entities).toEqual([
      { key: 'testUser', entity: TestUserEntity },
      { key: 'auth-token', entity: CustomKeyEntity },
    ]);
  });

  it('forwards `imports` when provided, leaves it `undefined` otherwise', () => {
    class FakeImport {}
    const withImports = defineAuthFeature({
      entities: [TestUserEntity],
      adapter: TestAuthAdapter,
      imports: [FakeImport],
    });
    expect(withImports.resource.imports).toEqual([FakeImport]);

    const withoutImports = defineAuthFeature({
      entities: [TestUserEntity],
      adapter: TestAuthAdapter,
    });
    expect(withoutImports.resource.imports).toBeUndefined();
  });
});

describe('isAuthFeatureBundle', () => {
  it('returns true for a bundle produced by defineAuthFeature', () => {
    const bundle = defineAuthFeature({
      entities: [TestUserEntity],
      adapter: TestAuthAdapter,
    });
    expect(isAuthFeatureBundle(bundle)).toBe(true);
  });

  it('returns false for a bare adapter class (the other shape `auth` accepts)', () => {
    expect(isAuthFeatureBundle(TestAuthAdapter)).toBe(false);
  });

  it('returns false for null / undefined / primitives', () => {
    expect(isAuthFeatureBundle(null)).toBe(false);
    expect(isAuthFeatureBundle(undefined)).toBe(false);
    expect(isAuthFeatureBundle('TestAuthAdapter')).toBe(false);
    expect(isAuthFeatureBundle(42)).toBe(false);
  });

  it('returns false for objects with the right shape but missing the `kind` discriminator (look-alikes do not pass)', () => {
    expect(
      isAuthFeatureBundle({
        provider: TestAuthAdapter,
        resource: { kind: ResourceKind.Module, entities: [] },
      }),
    ).toBe(false);
  });

  it('returns false for objects with a wrong `kind` value', () => {
    expect(
      isAuthFeatureBundle({
        kind: 'something-else',
        provider: TestAuthAdapter,
        resource: { kind: ResourceKind.Module, entities: [] },
      }),
    ).toBe(false);
  });
});
