import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  getDynamicRepositoryToken,
  RepositoryModule,
  TransactionReadOnlyConflictException,
  TransactionScope,
  Where,
  type RepositoryInterface,
  type RepositoryModuleInterface,
  type RepositoryProviderOptions,
} from '@concepta/nestjs-repository';

import { InMemoryFirestoreBackend } from '../backends/in-memory-firestore.backend';
import { FIRESTORE_BACKEND } from '../constants/firestore-repository.constants';
import { FirestoreRepositoryModule } from '../firestore-repository.module';
import { FirestoreTransaction } from '../transaction/firestore-transaction';
import { FirestoreTransactionRetryUnsupportedException } from '../exceptions/firestore-transaction-retry-unsupported.exception';
import { runInFirestoreTransaction } from '../transaction/run-in-firestore-transaction';
import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type { FirestoreTransactionHandle } from '../interfaces/firestore-transaction-handle.interface';
import { FirestoreDuplicateIdException } from '../exceptions/firestore-duplicate-id.exception';
import { FirestoreTransactionBackendMismatchException } from '../exceptions/firestore-transaction-backend-mismatch.exception';
import { FirestoreTransactionReadAfterWriteException } from '../exceptions/firestore-transaction-read-after-write.exception';
import { FirestoreTransactionWriteLimitExceededException } from '../exceptions/firestore-transaction-write-limit-exceeded.exception';
import { isFirestoreRepository } from '../repository/firestore-repository';
import { FIRESTORE_MAX_TRANSACTION_WRITES } from '../constants/firestore-transaction.constants';
import { firestoreIncrement } from '../interfaces/firestore-write.interface';

function stubBackend(
  overrides: Partial<FirestoreBackend> = {},
): FirestoreBackend {
  return {
    get: async () => null,
    create: async () => undefined,
    set: async () => undefined,
    delete: async () => undefined,
    queryBranch: async () => [],
    countBranch: async () => 0,
    writeBatch: async () => undefined,
    runTransaction: async (fn) => {
      const handle = {
        get: async () => null,
        create: async () => undefined,
        set: async () => undefined,
        delete: async () => undefined,
        queryBranch: async () => [],
        countBranch: async () => 0,
      } satisfies FirestoreTransactionHandle;
      return fn(handle);
    },
    ...overrides,
  };
}

class AccountEntity {
  id!: string;
  balance!: number;
}

class SoftAccountEntity {
  id!: string;
  balance!: number;
  dateRemoved!: Date | null;
}

function firestoreModuleFor(
  backend: InMemoryFirestoreBackend,
  collection: string,
): RepositoryModuleInterface {
  return {
    name: FirestoreRepositoryModule.name,
    forFeature: (entities: RepositoryProviderOptions[]) =>
      FirestoreRepositoryModule.forFeature(
        entities.map((entity) => ({
          key: entity.key,
          entity: entity.entity,
          collection,
        })),
        { backend },
      ),
  };
}

describe('Firestore transactions (P1-1)', () => {
  let backend: InMemoryFirestoreBackend;

  beforeEach(() => {
    backend = new InMemoryFirestoreBackend();
  });

  it('registers a transaction factory on forFeature', () => {
    const feature = FirestoreRepositoryModule.forFeature(
      [{ key: 'account', entity: AccountEntity, collection: 'accounts-tx' }],
      { backend },
    );

    expect(feature.transactionFactories).toHaveLength(1);
    expect(feature.transactionFactories?.[0]?.key).toMatch(/^firestore:/);
  });

  it('runTransaction commits multi-doc writes atomically', async () => {
    await backend.create('accounts-cb', 'a', { id: 'a', balance: 100 });
    await backend.create('accounts-cb', 'b', { id: 'b', balance: 0 });

    await backend.runTransaction(async (tx) => {
      const a = await tx.get('accounts-cb', 'a');
      const b = await tx.get('accounts-cb', 'b');
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      await tx.set('accounts-cb', 'a', { id: 'a', balance: 75 }, false);
      await tx.set('accounts-cb', 'b', { id: 'b', balance: 25 }, false);
    });

    expect(await backend.get('accounts-cb', 'a')).toMatchObject({
      balance: 75,
    });
    expect(await backend.get('accounts-cb', 'b')).toMatchObject({
      balance: 25,
    });
  });

  it('runTransaction discards writes when the callback throws', async () => {
    await backend.create('accounts-rb', 'a', { id: 'a', balance: 100 });

    await expect(
      backend.runTransaction(async (tx) => {
        await tx.set('accounts-rb', 'a', { id: 'a', balance: 0 }, false);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await backend.get('accounts-rb', 'a')).toMatchObject({
      balance: 100,
    });
  });

  it('runTransaction rejects read-after-write', async () => {
    await backend.create('accounts-raw', 'a', { id: 'a', balance: 100 });

    await expect(
      backend.runTransaction(async (tx) => {
        await tx.set('accounts-raw', 'a', { id: 'a', balance: 50 }, false);
        await tx.get('accounts-raw', 'a');
      }),
    ).rejects.toBeInstanceOf(FirestoreTransactionReadAfterWriteException);
  });

  it('imperative bridge refuses a Firestore retry instead of empty commit', async () => {
    let attempts = 0;
    const retryingBackend = stubBackend({
      runTransaction: async (fn) => {
        const handle = {
          get: async () => ({ id: 'a', balance: 100 }),
          create: async () => undefined,
          set: async () => undefined,
          delete: async () => undefined,
          queryBranch: async () => [],
          countBranch: async () => 0,
        } satisfies FirestoreTransactionHandle;
        attempts += 1;
        await fn(handle);
        attempts += 1;
        await fn(handle);
        return undefined as never;
      },
    });

    const tx = new FirestoreTransaction(retryingBackend);
    await tx.start();
    await expect(tx.commit()).rejects.toBeInstanceOf(
      FirestoreTransactionRetryUnsupportedException,
    );
    expect(attempts).toBe(2);
  });

  it('runInFirestoreTransaction joins ambient handle on repo calls', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-callback'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );

    await repo.create({ id: 'a', balance: 100 });
    await repo.create({ id: 'b', balance: 0 });

    await runInFirestoreTransaction(backend, async () => {
      const a = await repo.findOne({ where: Where.eq('id', 'a') });
      const b = await repo.findOne({ where: Where.eq('id', 'b') });
      await repo.update(a!, { balance: 70 });
      await repo.update(b!, { balance: 30 });
    });

    expect(await repo.findOne({ where: Where.eq('id', 'a') })).toMatchObject({
      balance: 70,
    });
    expect(await repo.findOne({ where: Where.eq('id', 'b') })).toMatchObject({
      balance: 30,
    });
  });

  it('FirestoreRepository.transaction joins ambient handle without passing backend', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-repo-tx'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );
    expect(isFirestoreRepository(repo)).toBe(true);
    if (!isFirestoreRepository(repo)) {
      throw new Error('expected FirestoreRepository');
    }

    expect(wired.get(FIRESTORE_BACKEND)).toBe(backend);

    await repo.create({ id: 'a', balance: 100 });
    await repo.create({ id: 'b', balance: 0 });

    await repo.transaction(async () => {
      const a = await repo.findOne({ where: Where.eq('id', 'a') });
      const b = await repo.findOne({ where: Where.eq('id', 'b') });
      await repo.update(a!, { balance: 55 });
      await repo.update(b!, { balance: 45 });
    });

    expect(await repo.findOne({ where: Where.eq('id', 'a') })).toMatchObject({
      balance: 55,
    });
    expect(await repo.findOne({ where: Where.eq('id', 'b') })).toMatchObject({
      balance: 45,
    });
  });

  it('runInFirestoreTransaction re-executes the body when the SDK retries', async () => {
    let bodyRuns = 0;
    let attempts = 0;
    const retryingBackend = stubBackend({
      runTransaction: async (fn) => {
        const handle = {
          get: async () => null,
          create: async () => undefined,
          set: async () => undefined,
          delete: async () => undefined,
          queryBranch: async () => [],
          countBranch: async () => 0,
        } satisfies FirestoreTransactionHandle;
        attempts += 1;
        await fn(handle);
        if (attempts === 1) {
          attempts += 1;
          return fn(handle);
        }
        return undefined as never;
      },
    });

    await runInFirestoreTransaction(retryingBackend, async () => {
      bodyRuns += 1;
    });

    expect(attempts).toBe(2);
    expect(bodyRuns).toBe(2);
  });

  it('nested runInFirestoreTransaction joins the ambient transaction', async () => {
    let outerStarts = 0;
    const countingBackend = stubBackend({
      runTransaction: async (fn) => {
        outerStarts += 1;
        const handle = {
          get: async () => null,
          create: async () => undefined,
          set: async () => undefined,
          delete: async () => undefined,
          queryBranch: async () => [],
          countBranch: async () => 0,
        } satisfies FirestoreTransactionHandle;
        return fn(handle);
      },
    });

    const result = await runInFirestoreTransaction(
      countingBackend,
      async () => {
        return runInFirestoreTransaction(
          countingBackend,
          async () => 'nested-ok',
        );
      },
    );

    expect(result).toBe('nested-ok');
    expect(outerStarts).toBe(1);
  });

  it('refuses more than 500 writes in one transaction', async () => {
    await expect(
      backend.runTransaction(async (tx) => {
        for (let i = 0; i <= FIRESTORE_MAX_TRANSACTION_WRITES; i += 1) {
          await tx.set(
            'accounts-limit',
            `row-${i}`,
            { id: `row-${i}`, balance: i },
            false,
          );
        }
      }),
    ).rejects.toBeInstanceOf(FirestoreTransactionWriteLimitExceededException);
  });

  it('applies firestoreIncrement without a transaction', async () => {
    await backend.create('counters', 'c1', { id: 'c1', value: 1 });
    await backend.set('counters', 'c1', { value: firestoreIncrement(4) }, true);
    expect(await backend.get('counters', 'c1')).toMatchObject({ value: 5 });
  });

  it('writeBatch creates atomically and rolls back on duplicate', async () => {
    await backend.create('batch-coll', 'a', { id: 'a', balance: 1 });
    await expect(
      backend.writeBatch([
        {
          op: 'create',
          collection: 'batch-coll',
          id: 'b',
          data: { id: 'b', balance: 2 },
        },
        {
          op: 'create',
          collection: 'batch-coll',
          id: 'a',
          data: { id: 'a', balance: 3 },
        },
      ]),
    ).rejects.toBeInstanceOf(FirestoreDuplicateIdException);
    expect(await backend.get('batch-coll', 'b')).toBeNull();
  });

  it('nested runInFirestoreTransaction refuses a different backend', async () => {
    const other = new InMemoryFirestoreBackend();

    await expect(
      runInFirestoreTransaction(backend, async () =>
        runInFirestoreTransaction(other, async () => 'should not run'),
      ),
    ).rejects.toBeInstanceOf(FirestoreTransactionBackendMismatchException);
  });

  it('a repository on another backend does not join the ambient transaction', async () => {
    const other = new InMemoryFirestoreBackend();
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(other, 'accounts-other-backend'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );

    await expect(
      runInFirestoreTransaction(backend, async () => {
        await repo.create({ id: 'a', balance: 1 });
        throw new Error('roll back the ambient transaction');
      }),
    ).rejects.toThrow('roll back the ambient transaction');

    // Written through its own backend, so the ambient rollback cannot undo it.
    await expect(
      repo.findOne({ where: Where.eq('id', 'a') }),
    ).resolves.toMatchObject({ balance: 1 });
  });

  it('soft-deletable upsert on another backend during an ambient transaction writes independently, not a span error', async () => {
    const other = new InMemoryFirestoreBackend();
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: {
            name: FirestoreRepositoryModule.name,
            forFeature: (entities: RepositoryProviderOptions[]) =>
              FirestoreRepositoryModule.forFeature(
                entities.map((entity) => ({
                  key: entity.key,
                  entity: entity.entity,
                  collection: 'soft-accounts-cross-backend',
                  softDeleteField: 'dateRemoved',
                })),
                { backend: other },
              ),
          },
          entities: [{ key: 'soft-account', entity: SoftAccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<SoftAccountEntity>>(
      getDynamicRepositoryToken('soft-account'),
    );

    // `backend` (A) owns the ambient transaction; `other` (B) is a different
    // database. The soft-deletable upsert must NOT auto-open a B transaction
    // (that would hit the cross-backend span guard and throw). It writes
    // through B independently, still materializing the soft-delete marker.
    await expect(
      runInFirestoreTransaction(backend, async () => {
        await repo.upsert({ id: 'a', balance: 1 });
      }),
    ).resolves.toBeUndefined();

    await expect(
      repo.findOne({ where: Where.eq('id', 'a') }),
    ).resolves.toMatchObject({ balance: 1, dateRemoved: null });
  });

  it('transactional create after a write is rejected like the Admin handle', async () => {
    await expect(
      backend.runTransaction(async (tx) => {
        await tx.set(
          'accounts-read-order',
          'a',
          { id: 'a', balance: 1 },
          false,
        );
        await tx.create('accounts-read-order', 'b', { id: 'b', balance: 2 });
      }),
    ).rejects.toBeInstanceOf(FirestoreTransactionReadAfterWriteException);
  });

  it('runInFirestoreTransaction surfaces duplicate create as FirestoreDuplicateIdException', async () => {
    await backend.create('dup-coll', 'same', { id: 'same', balance: 1 });

    await expect(
      backend.runTransaction(async (tx) => {
        await tx.create('dup-coll', 'same', { id: 'same', balance: 2 });
      }),
    ).rejects.toBeInstanceOf(FirestoreDuplicateIdException);
  });

  it('TransactionScope + { ctx } joins ambient transaction on repo calls', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-scope'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );
    const scope = wired.get(TransactionScope);

    await repo.create({ id: 'a', balance: 100 });
    await repo.create({ id: 'b', balance: 0 });

    await scope.run({}, async (ctx) => {
      const a = await repo.findOne({ where: Where.eq('id', 'a'), ctx });
      const b = await repo.findOne({ where: Where.eq('id', 'b'), ctx });
      expect(a?.balance).toBe(100);
      expect(b?.balance).toBe(0);
      await repo.update(a!, { balance: 60 }, { ctx });
      await repo.update(b!, { balance: 40 }, { ctx });
    });

    expect(await repo.findOne({ where: Where.eq('id', 'a') })).toMatchObject({
      balance: 60,
    });
    expect(await repo.findOne({ where: Where.eq('id', 'b') })).toMatchObject({
      balance: 40,
    });
  });

  it('TransactionScope rolls back repo writes when the operation throws', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-scope-rb'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );
    const scope = wired.get(TransactionScope);

    await repo.create({ id: 'a', balance: 100 });

    await expect(
      scope.run({}, async (ctx) => {
        const a = await repo.findOne({ where: Where.eq('id', 'a'), ctx });
        await repo.update(a!, { balance: 1 }, { ctx });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    expect(await repo.findOne({ where: Where.eq('id', 'a') })).toMatchObject({
      balance: 100,
    });
  });

  // Pins CONFIGURATION.md §8a: `run()` fails *open*. With no transaction
  // factory registered the callback still runs, and `txCtx.trx` existing
  // does not mean a transaction is active — it is a manager holding zero
  // transactions, so a throw rolls back nothing.
  it('run() runs unprotected when no factory is registered', async () => {
    const empty = await Test.createTestingModule({
      imports: [RepositoryModule.forRoot({})],
    }).compile();
    const scope = empty.get(TransactionScope);
    const runTransaction = vi.spyOn(backend, 'runTransaction');

    let callbackRan = false;
    let isSupported: boolean | undefined;

    await expect(
      scope.run({}, async (txCtx) => {
        callbackRan = true;
        isSupported = txCtx.trx.isSupported;
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    expect(callbackRan).toBe(true);
    expect(isSupported).toBe(false);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  // Pins CONFIGURATION.md §8a: `run()` itself starts no transaction.
  // The concrete adapter starts one lazily, on the first repository call
  // that forwards `txCtx`.
  it('TransactionScope.run starts no transaction until a repo call forwards txCtx', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-lazy-start'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );
    const scope = wired.get(TransactionScope);
    const runTransaction = vi.spyOn(backend, 'runTransaction');

    // A transaction-capable adapter IS registered, so `isSupported` is
    // true — yet entering the scope without a repo call starts nothing.
    await scope.run({}, async (txCtx) => {
      expect(txCtx.trx.isSupported).toBe(true);
    });
    expect(runTransaction).not.toHaveBeenCalled();

    // The first repo call forwarding `txCtx` is what actually starts it.
    await scope.run({}, async (txCtx) => {
      await repo.create({ id: 'lazy', balance: 1 }, { ctx: txCtx });
    });
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  // Pins CONFIGURATION.md §8a: a nested `run()` joins the outer manager
  // and does NOT own the boundary. A nested scope asking for a DIFFERENT
  // `readOnly` than the one it joins is rejected rather than silently
  // ignored, so a read-only intent can no longer write through an outer
  // writing scope.
  it('nested runReadOnly inside a writing scope is rejected', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-nested'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );
    const scope = wired.get(TransactionScope);

    await repo.create({ id: 'a', balance: 100 });

    await expect(
      scope.run({}, async (outerCtx) => {
        // Nested: `outerCtx` already carries the overlay, so this joins
        // rather than opening its own scope — and its `readOnly: true`
        // contradicts the writing scope it joined.
        await scope.runReadOnly(outerCtx, async (innerCtx) => {
          const a = await repo.findOne({
            where: Where.eq('id', 'a'),
            ctx: innerCtx,
          });
          await repo.update(a!, { balance: 7 }, { ctx: innerCtx });
        });
      }),
    ).rejects.toThrow(TransactionReadOnlyConflictException);

    // The outer scope rolled back with the conflict, so nothing landed.
    expect(await repo.findOne({ where: Where.eq('id', 'a') })).toMatchObject({
      balance: 100,
    });
  });

  // The other half of the same rule: a nested `run()` that does NOT
  // contradict the scope it joins shares the outer manager, and the
  // outer scope alone owns commit.
  it('nested run joins the outer manager and the outer scope commits', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-nested-join'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );
    const scope = wired.get(TransactionScope);

    await repo.create({ id: 'a', balance: 100 });

    let sameManager: boolean | undefined;

    await scope.run({}, async (outerCtx) => {
      await scope.run(outerCtx, async (innerCtx) => {
        sameManager = innerCtx.trx === outerCtx.trx;
        const a = await repo.findOne({
          where: Where.eq('id', 'a'),
          ctx: innerCtx,
        });
        await repo.update(a!, { balance: 7 }, { ctx: innerCtx });
      });
    });

    expect(sameManager).toBe(true);
    expect(await repo.findOne({ where: Where.eq('id', 'a') })).toMatchObject({
      balance: 7,
    });
  });

  it('soft-deletable upsert before a write succeeds inside a transaction', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: {
            name: FirestoreRepositoryModule.name,
            forFeature: (entities: RepositoryProviderOptions[]) =>
              FirestoreRepositoryModule.forFeature(
                entities.map((entity) => ({
                  key: entity.key,
                  entity: entity.entity,
                  collection: 'soft-accounts-upsert-ok',
                  softDeleteField: 'dateRemoved',
                })),
                { backend },
              ),
          },
          entities: [{ key: 'soft-account', entity: SoftAccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<SoftAccountEntity>>(
      getDynamicRepositoryToken('soft-account'),
    );
    expect(isFirestoreRepository(repo)).toBe(true);
    if (!isFirestoreRepository(repo)) {
      throw new Error('expected FirestoreRepository');
    }

    await repo.transaction(async () => {
      await repo.upsert({ id: 'a', balance: 1 });
      await repo.update(
        { id: 'a', balance: 1, dateRemoved: null },
        { balance: 2 },
      );
    });

    await expect(
      repo.findOne({ where: Where.eq('id', 'a') }),
    ).resolves.toMatchObject({ balance: 2, dateRemoved: null });
  });

  it('soft-deletable upsert after a write throws FIRESTORE_TRANSACTION_READ_AFTER_WRITE', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: {
            name: FirestoreRepositoryModule.name,
            forFeature: (entities: RepositoryProviderOptions[]) =>
              FirestoreRepositoryModule.forFeature(
                entities.map((entity) => ({
                  key: entity.key,
                  entity: entity.entity,
                  collection: 'soft-accounts-upsert-raw',
                  softDeleteField: 'dateRemoved',
                })),
                { backend },
              ),
          },
          entities: [{ key: 'soft-account', entity: SoftAccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<SoftAccountEntity>>(
      getDynamicRepositoryToken('soft-account'),
    );
    expect(isFirestoreRepository(repo)).toBe(true);
    if (!isFirestoreRepository(repo)) {
      throw new Error('expected FirestoreRepository');
    }

    await expect(
      repo.transaction(async () => {
        await repo.create({ id: 'a', balance: 1 });
        await repo.upsert({ id: 'a', balance: 2 });
      }),
    ).rejects.toBeInstanceOf(FirestoreTransactionReadAfterWriteException);
  });

  it('soft-deletable upsert outside a transaction opens one so read+write are atomic', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: {
            name: FirestoreRepositoryModule.name,
            forFeature: (entities: RepositoryProviderOptions[]) =>
              FirestoreRepositoryModule.forFeature(
                entities.map((entity) => ({
                  key: entity.key,
                  entity: entity.entity,
                  collection: 'soft-accounts-upsert-atomic',
                  softDeleteField: 'dateRemoved',
                })),
                { backend },
              ),
          },
          entities: [{ key: 'soft-account', entity: SoftAccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<SoftAccountEntity>>(
      getDynamicRepositoryToken('soft-account'),
    );

    const runTransaction = vi.spyOn(backend, 'runTransaction');
    await repo.upsert({ id: 'a', balance: 1 });
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('non-soft-deletable upsert skips the transaction (no read to race)', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-upsert-plain'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );

    const runTransaction = vi.spyOn(backend, 'runTransaction');
    await repo.upsert({ id: 'a', balance: 1 });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('soft-deletable upsert detects a concurrent write and never resurrects a soft-deleted row', async () => {
    // Instrumented backend: injects a concurrent create+soft-delete exactly
    // once, during the upsert's in-transaction read and before it commits. The
    // optimistic conflict check must then reject the attempt instead of writing
    // a materialized `null` over the row soft-deleted underneath it.
    class InterleavingBackend extends InMemoryFirestoreBackend {
      private injected = false;
      onFirstRead?: () => Promise<void>;

      private async fireOnce(): Promise<void> {
        if (this.injected || this.onFirstRead === undefined) {
          return;
        }
        this.injected = true;
        await this.onFirstRead();
      }

      override async runTransaction<T>(
        fn: (tx: FirestoreTransactionHandle) => Promise<T>,
      ): Promise<T> {
        return super.runTransaction(async (tx) => {
          const wrapped: FirestoreTransactionHandle = {
            get: async (collection, id) => {
              const row = await tx.get(collection, id);
              await this.fireOnce();
              return row;
            },
            create: tx.create.bind(tx),
            set: tx.set.bind(tx),
            delete: tx.delete.bind(tx),
            queryBranch: tx.queryBranch.bind(tx),
            countBranch: tx.countBranch.bind(tx),
          };
          return fn(wrapped);
        });
      }
    }

    const collection = 'soft-accounts-race';
    const interleaving = new InterleavingBackend();
    interleaving.onFirstRead = async () => {
      await interleaving.create(collection, 'x', { id: 'x', balance: 9 });
      await interleaving.set(
        collection,
        'x',
        { dateRemoved: new Date() },
        true,
      );
    };

    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: {
            name: FirestoreRepositoryModule.name,
            forFeature: (entities: RepositoryProviderOptions[]) =>
              FirestoreRepositoryModule.forFeature(
                entities.map((entity) => ({
                  key: entity.key,
                  entity: entity.entity,
                  collection,
                  softDeleteField: 'dateRemoved',
                })),
                { backend: interleaving },
              ),
          },
          entities: [{ key: 'soft-account', entity: SoftAccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<SoftAccountEntity>>(
      getDynamicRepositoryToken('soft-account'),
    );

    // Read saw "missing", but the concurrent create+soft-delete lands before
    // commit, so the attempt aborts on the optimistic-conflict check. The
    // in-memory backend has no retry loop, so the abort surfaces as a throw;
    // real Firestore RETRIES the aborted attempt and the re-read then sees the
    // soft-deleted row (no resurrection) and resolves. Either way the
    // resurrecting write never commits — the load-bearing proof is the
    // visibility assertions below, not the throw shape.
    //
    // The repository permeator wraps the failure in a generic query exception,
    // so assert on the preserved `originalError` to prove the abort came from
    // the optimistic-conflict check and not some unrelated throw.
    const rejection = await repo.upsert({ id: 'x', balance: 1 }).then(
      () => undefined,
      (error: unknown) => error,
    );
    const originalError = (
      rejection as { context?: { originalError?: { message?: string } } }
    ).context?.originalError;
    expect(originalError?.message).toMatch(/in-memory transaction conflict/);

    // The row stays soft-deleted: hidden from default reads, present with
    // `withDeleted`, never resurrected by a stale `null`.
    await expect(repo.find()).resolves.toEqual([]);
    await expect(repo.find({ withDeleted: true })).resolves.toEqual([
      expect.objectContaining({ id: 'x', dateRemoved: expect.any(Date) }),
    ]);
  });

  it('createMany inside a transaction hoists existence reads before writes', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-create-many-tx'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );
    expect(isFirestoreRepository(repo)).toBe(true);
    if (!isFirestoreRepository(repo)) {
      throw new Error('expected FirestoreRepository');
    }

    await repo.transaction(async () => {
      await repo.createMany([
        { id: 'a', balance: 1 },
        { id: 'b', balance: 2 },
        { id: 'c', balance: 3 },
      ]);
    });

    await expect(repo.find()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', balance: 1 }),
        expect.objectContaining({ id: 'b', balance: 2 }),
        expect.objectContaining({ id: 'c', balance: 3 }),
      ]),
    );
  });

  it('createMany inside a transaction rejects a duplicate id before writing', async () => {
    const wired = await Test.createTestingModule({
      imports: [
        RepositoryModule.forRoot({}),
        RepositoryModule.forFeature({
          module: firestoreModuleFor(backend, 'accounts-create-many-dup'),
          entities: [{ key: 'account', entity: AccountEntity }],
        }),
      ],
    }).compile();

    const repo = wired.get<RepositoryInterface<AccountEntity>>(
      getDynamicRepositoryToken('account'),
    );
    expect(isFirestoreRepository(repo)).toBe(true);
    if (!isFirestoreRepository(repo)) {
      throw new Error('expected FirestoreRepository');
    }

    await repo.create({ id: 'a', balance: 1 });

    await expect(
      repo.transaction(async () => {
        await repo.createMany([
          { id: 'b', balance: 2 },
          { id: 'a', balance: 3 },
        ]);
      }),
    ).rejects.toBeInstanceOf(FirestoreDuplicateIdException);

    await expect(
      repo.findOne({ where: Where.eq('id', 'b') }),
    ).resolves.toBeNull();
  });
});
