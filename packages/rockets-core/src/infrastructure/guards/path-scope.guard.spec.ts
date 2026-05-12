import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import { Test } from '@nestjs/testing';
import { PathScopeGuard } from './path-scope.guard';

interface FakeParent {
  id: string;
  userId: string;
}

class FakeParentRepo {
  constructor(private readonly rows: FakeParent[]) {}

  /**
   * The guard builds a `Where.and(Where.eq('id'), Where.eq(ownerColumn))`
   * AST. We don't reimplement Where here — we walk the AST keys we know
   * the guard sets via the public `Where.eq` constructor (`field`,
   * `value`) and run an in-memory match. That keeps the test focused on
   * the guard's branching, not on Where AST internals.
   */
  async findOne(options: unknown): Promise<FakeParent | null> {
    const where = (options as { where: { conditions?: unknown[] } }).where;
    const flatten = (node: unknown): { field: string; value: unknown }[] => {
      if (
        node &&
        typeof node === 'object' &&
        'conditions' in node &&
        Array.isArray((node as { conditions: unknown[] }).conditions)
      ) {
        return (node as { conditions: unknown[] }).conditions.flatMap(flatten);
      }
      const cond = node as { field?: string; value?: unknown };
      return cond?.field !== undefined
        ? [{ field: cond.field, value: cond.value }]
        : [];
    };
    const eqs = flatten(where);
    const id = eqs.find((c) => c.field === 'id')?.value;
    const userId = eqs.find((c) => c.field === 'userId')?.value;
    return this.rows.find((r) => r.id === id && r.userId === userId) ?? null;
  }
}

function buildExecutionContext(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('PathScopeGuard.for()', () => {
  it('returns the same subclass for identical (param, key, column) triples', () => {
    const A = PathScopeGuard.for('petId', 'pet', 'userId');
    const B = PathScopeGuard.for('petId', 'pet', 'userId');
    expect(A).toBe(B);
  });

  it('returns different subclasses for different triples', () => {
    const A = PathScopeGuard.for('petId', 'pet', 'userId');
    const B = PathScopeGuard.for('petId', 'pet', 'orgId');
    const C = PathScopeGuard.for('parentId', 'pet', 'userId');
    expect(A).not.toBe(B);
    expect(A).not.toBe(C);
    expect(B).not.toBe(C);
  });

  it('names the subclass using the binding triple', () => {
    const Sub = PathScopeGuard.for('petId', 'pet', 'userId');
    expect(Sub.name).toBe('PathScopeGuard_petId_pet_userId');
  });
});

describe('PathScopeGuard.canActivate', () => {
  const parentRows: FakeParent[] = [
    { id: 'p1', userId: 'u1' },
    { id: 'p2', userId: 'u2' },
  ];

  async function buildGuard(): Promise<PathScopeGuard> {
    const Sub = PathScopeGuard.for('petId', 'pet', 'userId');
    const repoToken = getDynamicRepositoryToken('pet');
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: repoToken, useValue: new FakeParentRepo(parentRows) },
        Sub,
      ],
    }).compile();
    return moduleRef.get<PathScopeGuard>(Sub);
  }

  it('throws 401 when no authenticated actor on the request', async () => {
    const guard = await buildGuard();
    const ctx = buildExecutionContext({ params: { petId: 'p1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 404 when the parent param is missing', async () => {
    const guard = await buildGuard();
    const ctx = buildExecutionContext({ user: { id: 'u1' }, params: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 404 when the parent does not exist (cannot probe existence)', async () => {
    const guard = await buildGuard();
    const ctx = buildExecutionContext({
      user: { id: 'u1' },
      params: { petId: 'does-not-exist' },
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 404 when the parent exists but belongs to a different actor', async () => {
    const guard = await buildGuard();
    const ctx = buildExecutionContext({
      user: { id: 'u1' },
      params: { petId: 'p2' }, // owned by u2
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns true when actor owns the parent', async () => {
    const guard = await buildGuard();
    const ctx = buildExecutionContext({
      user: { id: 'u1' },
      params: { petId: 'p1' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
