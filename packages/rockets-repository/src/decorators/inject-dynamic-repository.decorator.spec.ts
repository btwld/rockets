import 'reflect-metadata';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { InjectDynamicRepository } from './inject-dynamic-repository.decorator';

const SELF_PARAM_TYPES = 'self:paramtypes';

class FooEntity {}

function readInjectToken(target: object, paramIndex: number): unknown {
  const meta =
    Reflect.getMetadata(SELF_PARAM_TYPES, target) ??
    (Reflect.getMetadata(SELF_PARAM_TYPES, target) as unknown);
  if (!Array.isArray(meta)) return undefined;
  const entry = meta.find(
    (m: unknown) =>
      typeof m === 'object' &&
      m !== null &&
      'index' in (m as Record<string, unknown>) &&
      (m as { index: number }).index === paramIndex,
  );
  return entry === undefined ? undefined : (entry as { param: unknown }).param;
}

describe('InjectDynamicRepository', () => {
  it('class form derives the same token as string form', () => {
    class WithClass {
      constructor(
        @InjectDynamicRepository(FooEntity) public readonly r: unknown,
      ) {}
    }
    class WithString {
      constructor(@InjectDynamicRepository('foo') public readonly r: unknown) {}
    }

    const expected = getDynamicRepositoryToken('foo');
    expect(readInjectToken(WithClass, 0)).toBe(expected);
    expect(readInjectToken(WithString, 0)).toBe(expected);
  });

  it('preserves namespaced string keys (escape hatch)', () => {
    class WithNamespace {
      constructor(
        @InjectDynamicRepository('billing/invoice') public readonly r: unknown,
      ) {}
    }
    expect(readInjectToken(WithNamespace, 0)).toBe(
      getDynamicRepositoryToken('billing/invoice'),
    );
  });

  it('rejects anonymous class via deriveEntityKey error', () => {
    const Anon = (() => class {})();
    expect(() => InjectDynamicRepository(Anon)).toThrow(/anonymous class/);
  });
});
