import { Test } from '@nestjs/testing';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import { AfterCreateReloadHook } from './after-create-reload.hook';

interface FakeWidget {
  id: string;
  name: string;
  /** Eager relation that `save()` doesn't return — only present after reload. */
  category?: { id: string; label: string };
}

class FakeWidgetRepo {
  constructor(private readonly rows: FakeWidget[]) {}

  /**
   * Stubs the `Where.eq('id', ...)` shape: walks the AST flat to extract
   * the `id` value, then returns the matching row. Keeps the test focused
   * on the hook's branching, not on Where AST internals.
   */
  async findOne(options: unknown): Promise<FakeWidget | null> {
    const where = (options as { where: { field?: string; value?: unknown } })
      .where;
    const id = where?.field === 'id' ? where.value : undefined;
    return this.rows.find((r) => r.id === id) ?? null;
  }
}

// Stub entity classes — fields declared so the classes structurally
// satisfy `Type<FakeWidget>` for the `.for<FakeWidget>(WidgetEntity)`
// overload picked by the generic.
class WidgetEntity {
  id!: string;
  name!: string;
}
class GadgetEntity {
  id!: string;
  name!: string;
}
class PetTagEntity {
  id!: string;
  name!: string;
}

describe('AfterCreateReloadHook.for()', () => {
  it('returns the same subclass for identical entity classes', () => {
    const A = AfterCreateReloadHook.for(WidgetEntity);
    const B = AfterCreateReloadHook.for(WidgetEntity);
    expect(A).toBe(B);
  });

  it('returns different subclasses for different entity classes', () => {
    const A = AfterCreateReloadHook.for(WidgetEntity);
    const B = AfterCreateReloadHook.for(GadgetEntity);
    expect(A).not.toBe(B);
  });

  it('names the subclass after the entity class', () => {
    const Sub = AfterCreateReloadHook.for(PetTagEntity);
    expect(Sub.name).toBe('AfterCreateReloadHook_PetTagEntity');
  });
});

describe('AfterCreateReloadHook.afterCreate', () => {
  async function buildHook(
    rows: FakeWidget[],
  ): Promise<AfterCreateReloadHook<FakeWidget>> {
    const Sub = AfterCreateReloadHook.for<FakeWidget>(WidgetEntity);
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: getDynamicRepositoryToken('widget'),
          useValue: new FakeWidgetRepo(rows),
        },
        Sub,
      ],
    }).compile();
    return moduleRef.get(Sub);
  }

  it('returns the unchanged entity when id is missing', async () => {
    const hook = await buildHook([]);
    const created = { name: 'no-id' } as unknown as FakeWidget;
    const out = await hook.afterCreate(created);
    expect(out).toBe(created);
  });

  it('returns the unchanged entity when no row reloads', async () => {
    const hook = await buildHook([]);
    const created: FakeWidget = { id: 'w1', name: 'orig' };
    const out = await hook.afterCreate(created);
    expect(out).toBe(created);
    expect(out.category).toBeUndefined();
  });

  it('mutates the original instance with reloaded fields (eager relation populated)', async () => {
    const hook = await buildHook([
      {
        id: 'w1',
        name: 'reloaded-name',
        category: { id: 'c1', label: 'CategoryOne' },
      },
    ]);
    const created: FakeWidget = { id: 'w1', name: 'orig' };
    const out = await hook.afterCreate(created);
    expect(out).toBe(created); // same reference (preserve strategy)
    expect(out.category).toEqual({ id: 'c1', label: 'CategoryOne' });
    expect(out.name).toBe('reloaded-name');
  });
});
