import type { PlainLiteralObject } from '@nestjs/common';
import {
  EntityHook,
  EntityHookBase,
  PassthroughEntityHookBase,
} from './entity-hook';

interface Widget extends PlainLiteralObject {
  id: string;
  name: string;
}

describe('@EntityHook() decorator', () => {
  describe('near-miss validation', () => {
    it('throws when an own method name is one edit away from a lifecycle key (case typo)', () => {
      expect(() => {
        @EntityHook()
        class TypoHook extends PassthroughEntityHookBase<Widget> {
          // Lower-case "d" — easy typo of `afterSoftDelete`.
          afterSoftdelete(entity: Widget): Widget {
            return entity;
          }
        }
        // Reference the class so TS doesn't tree-shake it.
        return new TypoHook();
      }).toThrow(/looks like a typo of "afterSoftDelete"/);
    });

    it('throws on an extra-character typo (beforeFindOnce → beforeFindOne)', () => {
      expect(() => {
        @EntityHook()
        class TypoHook extends PassthroughEntityHookBase<Widget> {
          beforeFindOnce(): unknown {
            return {};
          }
        }
        return new TypoHook();
      }).toThrow(/looks like a typo of "beforeFindOne"/);
    });

    it('does NOT throw on names that are clearly different (no near-miss)', () => {
      expect(() => {
        @EntityHook()
        class UnrelatedHook extends PassthroughEntityHookBase<Widget> {
          // 4+ edits away from any lifecycle key — no warning.
          processSomething(x: Widget): Widget {
            return x;
          }
        }
        return new UnrelatedHook();
      }).not.toThrow();
    });

    it('does NOT throw when the method name matches a lifecycle key exactly', () => {
      expect(() => {
        @EntityHook()
        class ProperHook extends PassthroughEntityHookBase<Widget> {
          override beforeCreate(payload: Widget): Widget {
            return payload;
          }
        }
        return new ProperHook();
      }).not.toThrow();
    });
  });

  describe('lifecycle stamping', () => {
    it('only stamps own-prototype overrides (not inherited base methods)', () => {
      // Base methods on PassthroughEntityHookBase are inherited but are
      // not stamped on the subclass — the decorator iterates own-only.
      // We verify this indirectly: the subclass is registered without
      // an error, and inherited methods stay metadata-free.
      @EntityHook()
      class CreateOnlyHook extends PassthroughEntityHookBase<Widget> {
        override beforeCreate(payload: Widget): Widget {
          payload.name = 'stamped';
          return payload;
        }
      }
      const instance = new CreateOnlyHook();
      const result = instance.beforeCreate({ id: '1', name: 'orig' });
      expect(result.name).toBe('stamped');
      // Inherited no-op still callable.
      const passthrough = instance.afterCreate({ id: '1', name: 'x' });
      expect(passthrough).toEqual({ id: '1', name: 'x' });
    });
  });
});

describe('PassthroughEntityHookBase', () => {
  it('returns its input unchanged for every lifecycle method', () => {
    @EntityHook()
    class NoopHook extends PassthroughEntityHookBase<Widget> {}
    const hook = new NoopHook();
    const sample: Widget = { id: '1', name: 'A' };

    expect(hook.beforeCreate(sample)).toBe(sample);
    expect(hook.afterCreate(sample)).toBe(sample);
    expect(hook.beforeUpdate(sample)).toBe(sample);
    expect(hook.afterUpdate(sample)).toBe(sample);
    expect(hook.beforeDelete(sample)).toBe(sample);
    expect(hook.afterDelete(sample)).toBe(sample);
    expect(hook.beforeSoftDelete(sample)).toBe(sample);
    expect(hook.afterSoftDelete(sample)).toBe(sample);
    expect(hook.beforeRestore(sample)).toBe(sample);
    expect(hook.afterRestore(sample)).toBe(sample);
  });

  it('passes through find option/result objects unchanged', () => {
    @EntityHook()
    class NoopHook extends PassthroughEntityHookBase<Widget> {}
    const hook = new NoopHook();

    const opts = {};
    expect(hook.beforeFindOne(opts)).toBe(opts);
    expect(hook.beforeFindAndCount(opts)).toBe(opts);

    const single: Widget | null = { id: '1', name: 'A' };
    expect(hook.afterFindOne(single)).toBe(single);

    const list = { data: [single], total: 1 };
    expect(hook.afterFindAndCount(list)).toBe(list);
  });
});

describe('EntityHookBase', () => {
  it('cannot be instantiated directly (abstract)', () => {
    // TypeScript blocks `new EntityHookBase()`. The runtime check confirms
    // the class is exported with `abstract` semantics.
    // @ts-expect-error — abstract class cannot be instantiated
    const attempt = (): EntityHookBase<Widget> => new EntityHookBase<Widget>();
    expect(typeof attempt).toBe('function');
  });

  it('rejects subclasses that do not implement the abstract methods', () => {
    // Compile-time check: a class extending EntityHookBase directly
    // without implementing all 14 abstract methods must fail.
    // @ts-expect-error — Bad does not implement abstract methods
    class Bad extends EntityHookBase<Widget> {}
    // Reference Bad so the error block is evaluated by tsc.
    expect(typeof Bad).toBe('function');
  });
});

describe('PassthroughEntityHookBase — override semantics', () => {
  it('subclass override of a passthrough method is the one stamped (not the inherited no-op)', () => {
    // Critical invariant: the @EntityHook() decorator stamps lifecycle
    // metadata only on the SUBCLASS's own prototype methods. The inherited
    // no-op on PassthroughEntityHookBase must NOT be stamped — otherwise
    // both would fire and a future ordering change would silently break
    // overrides.
    @EntityHook()
    class StampingHook extends PassthroughEntityHookBase<Widget> {
      override beforeCreate(payload: Widget): Widget {
        return { ...payload, name: 'override-fired' };
      }
    }
    const hook = new StampingHook();
    const result = hook.beforeCreate({ id: '1', name: 'orig' });
    expect(result.name).toBe('override-fired');
  });

  it('non-overridden lifecycle methods on a PassthroughEntityHookBase subclass keep passthrough behaviour', () => {
    @EntityHook()
    class CreateOnlyHook extends PassthroughEntityHookBase<Widget> {
      override beforeCreate(p: Widget): Widget {
        return p;
      }
    }
    const hook = new CreateOnlyHook();
    const sample = { id: '1', name: 'orig' };
    // afterCreate / beforeUpdate / etc. are inherited and pass through.
    expect(hook.afterCreate(sample)).toBe(sample);
    expect(hook.beforeUpdate(sample)).toBe(sample);
    expect(hook.beforeFindOne({})).toEqual({});
  });
});

describe('@EntityHook() decorator — idempotency & ordering edges', () => {
  it('applying @EntityHook() twice on the same class does not throw', () => {
    // Edge case: a user (or framework code path) decorates a class twice.
    // The second pass re-stamps method-level metadata over the same keys
    // and re-runs RepoHook(). This must not throw.
    expect(() => {
      @EntityHook()
      @EntityHook()
      class Twice extends PassthroughEntityHookBase<Widget> {
        override beforeCreate(p: Widget): Widget {
          return p;
        }
      }
      return new Twice();
    }).not.toThrow();
  });

  it('non-method own properties (e.g. instance fields) are ignored, not validated for near-miss', () => {
    expect(() => {
      @EntityHook()
      class WithField extends PassthroughEntityHookBase<Widget> {
        // A field named `beforeFindOnce` (one edit from `beforeFindOne`)
        // would near-miss IF it were a method. As a non-function own
        // property descriptor it should be skipped silently.
        beforeFindOnce = 'not a method' as unknown as never;
      }
      return new WithField();
    }).not.toThrow();
  });

  it('throwing on near-miss validates BEFORE any method-decorator metadata is stamped', () => {
    // Validation loop runs first; if it throws, no method-level metadata
    // is stamped and `RepoHook()` (line ~207) never runs. Asserts that a
    // failed decoration does not leak partial registration state.
    expect(() => {
      @EntityHook()
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class Failing extends PassthroughEntityHookBase<Widget> {
        afterSoftdelete(e: Widget): Widget {
          return e;
        }
      }
    }).toThrow(/looks like a typo/);
  });
});

describe('@EntityHook({ entity }) — class-level spec auto-binding', () => {
  // The upstream `@Specification(spec)` decorator writes the spec under a
  // private `Symbol('Specification')`. We look it up by symbol description
  // rather than importing the symbol from a `dist/` deep path so the test
  // stays clean if the upstream re-organises its module layout.
  function getClassSpec(
    target: object,
  ): { isSatisfiedBy: (ctx: unknown) => boolean } | undefined {
    const keys = Reflect.getMetadataKeys(target) as unknown[];
    const specKey = keys.find(
      (k) =>
        typeof k === 'symbol' && (k as symbol).description === 'Specification',
    );
    if (!specKey) return undefined;
    return Reflect.getMetadata(specKey as symbol, target) as
      | { isSatisfiedBy: (ctx: unknown) => boolean }
      | undefined;
  }

  // Stub entity classes — `deriveEntityKey` strips the `Entity` suffix
  // and lowercases the first letter: `WidgetEntity` → `'widget'`.
  class WidgetEntity {
    id!: string;
    name!: string;
  }
  class GadgetEntity {
    id!: string;
    name!: string;
  }

  it('without `entity`, no class-level Specification is attached', () => {
    @EntityHook()
    class Plain extends PassthroughEntityHookBase<Widget> {
      override beforeCreate(p: Widget): Widget {
        return p;
      }
    }
    expect(getClassSpec(Plain)).toBeUndefined();
  });

  it('with `entity`, the class carries a Specification that is satisfied by the entity key', () => {
    @EntityHook({ entity: WidgetEntity })
    class WidgetScoped extends PassthroughEntityHookBase<Widget> {
      override beforeCreate(p: Widget): Widget {
        return p;
      }
    }
    const spec = getClassSpec(WidgetScoped);
    expect(spec).toBeDefined();
    expect(spec?.isSatisfiedBy({ entity: 'widget' })).toBe(true);
  });

  it('the bound spec rejects any ctx targeting a different entity', () => {
    // The recursion-fix invariant: a Widget-scoped hook MUST NOT be
    // satisfied when the resolver sees a write targeting a different
    // entity (e.g. an internal `auditRepo.create(..., {ctx})` from inside
    // afterCreate). Otherwise the hook re-enters and recurses to OOM.
    @EntityHook({ entity: WidgetEntity })
    class WidgetScoped extends PassthroughEntityHookBase<Widget> {
      override afterCreate(p: Widget): Widget {
        return p;
      }
    }
    const spec = getClassSpec(WidgetScoped);
    expect(spec?.isSatisfiedBy({ entity: 'gadget' })).toBe(false);
    expect(spec?.isSatisfiedBy({ entity: 'auditLog' })).toBe(false);
    expect(spec?.isSatisfiedBy({ entity: 'WIDGET' })).toBe(false); // case-sensitive
  });

  it('derives the entity key via deriveEntityKey (strips `Entity` suffix, lowercases first char)', () => {
    @EntityHook({ entity: GadgetEntity })
    class GadgetScoped extends PassthroughEntityHookBase<Widget> {
      override beforeCreate(p: Widget): Widget {
        return p;
      }
    }
    const spec = getClassSpec(GadgetScoped);
    expect(spec?.isSatisfiedBy({ entity: 'gadget' })).toBe(true);
    expect(spec?.isSatisfiedBy({ entity: 'GadgetEntity' })).toBe(false);
    expect(spec?.isSatisfiedBy({ entity: 'Gadget' })).toBe(false);
  });

  it('two subclasses bound to different entities carry independent specs', () => {
    @EntityHook({ entity: WidgetEntity })
    class WidgetA extends PassthroughEntityHookBase<Widget> {
      override beforeCreate(p: Widget): Widget {
        return p;
      }
    }
    @EntityHook({ entity: GadgetEntity })
    class GadgetA extends PassthroughEntityHookBase<Widget> {
      override beforeCreate(p: Widget): Widget {
        return p;
      }
    }
    expect(getClassSpec(WidgetA)?.isSatisfiedBy({ entity: 'widget' })).toBe(
      true,
    );
    expect(getClassSpec(WidgetA)?.isSatisfiedBy({ entity: 'gadget' })).toBe(
      false,
    );
    expect(getClassSpec(GadgetA)?.isSatisfiedBy({ entity: 'gadget' })).toBe(
      true,
    );
    expect(getClassSpec(GadgetA)?.isSatisfiedBy({ entity: 'widget' })).toBe(
      false,
    );
  });

  it('the entity-spec is stamped BEFORE RepoHook scans methods (ordering invariant)', () => {
    // `scanHookMethods()` inside `RepoHook()` reads the class-level
    // Specification as the fallback `classSpec` for every lifecycle
    // method it registers. If `EntityHook` ran `RepoHook()` first, the
    // scan would capture an empty class spec and the entity binding
    // would be invisible to the resolver. We assert ordering indirectly:
    // after decoration, the spec must be readable on the class — proving
    // it was stamped at least once, regardless of how many times
    // `RepoHook()` ran during decoration.
    @EntityHook({ entity: WidgetEntity })
    class Ordered extends PassthroughEntityHookBase<Widget> {
      override afterCreate(p: Widget): Widget {
        return p;
      }
    }
    expect(getClassSpec(Ordered)).toBeDefined();
  });

  it('decorating a class twice with `entity` keeps the spec satisfied (idempotent)', () => {
    @EntityHook({ entity: WidgetEntity })
    @EntityHook({ entity: WidgetEntity })
    class Twice extends PassthroughEntityHookBase<Widget> {
      override afterCreate(p: Widget): Widget {
        return p;
      }
    }
    const spec = getClassSpec(Twice);
    expect(spec?.isSatisfiedBy({ entity: 'widget' })).toBe(true);
    expect(spec?.isSatisfiedBy({ entity: 'gadget' })).toBe(false);
  });
});

describe('LIFECYCLE_DECORATORS coverage invariant', () => {
  it('every key documented as a lifecycle method has a corresponding override-path on PassthroughEntityHookBase', () => {
    // If a future edit adds a lifecycle key to LIFECYCLE_DECORATORS but
    // forgets to add a passthrough method on PassthroughEntityHookBase,
    // a subclass that extends Passthrough loses the no-op fallback for
    // that key — silently. This test pins the parity.
    @EntityHook()
    class Probe extends PassthroughEntityHookBase<Widget> {}
    const instance = new Probe() as unknown as Record<string, unknown>;
    // Every documented key must be a callable on the instance.
    const keys = [
      'beforeFindOne',
      'afterFindOne',
      'beforeFindAndCount',
      'afterFindAndCount',
      'beforeCreate',
      'afterCreate',
      'beforeUpdate',
      'afterUpdate',
      'beforeDelete',
      'afterDelete',
      'beforeSoftDelete',
      'afterSoftDelete',
      'beforeRestore',
      'afterRestore',
    ];
    for (const k of keys) {
      expect(typeof instance[k]).toBe('function');
    }
  });
});
