import { randomUUID } from 'crypto';
import { AppContextHost, type DeepPartial } from '@concepta/nestjs-core';
import {
  isWhereCondition,
  RepositoryAdapter,
  SortOrder,
  TrxCtx,
  type RepositoryCreateOptions,
  type RepositoryDeleteOptions,
  type RepositoryFindOneOptions,
  type RepositoryFindOptions,
  type RepositoryMetadataInterface,
  type RepositoryRestoreOptions,
  type RepositoryUpdateOptions,
  type RepositoryUpsertOptions,
  type WhereClause,
} from '@concepta/nestjs-repository';
import type { PlainLiteralObject } from '@nestjs/common';

import {
  FIRESTORE_ALT_SOFT_DELETE_FIELD,
  FIRESTORE_DEFAULT_SOFT_DELETE_FIELD,
} from '../constants/firestore-soft-delete.constants';
import { FIRESTORE_DEFAULT_TRANSACTION_KEY } from '../constants/firestore-transaction.constants';
import { FIRESTORE_MAX_BATCH_WRITES } from '../constants/firestore-transaction.constants';
import { FirestoreDuplicateIdException } from '../exceptions/firestore-duplicate-id.exception';
import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type {
  FirestoreOrderBy,
  FirestoreQueryRequest,
} from '../interfaces/firestore-query.interface';
import type { FirestoreTransactionHandle } from '../interfaces/firestore-transaction-handle.interface';
import {
  firestoreIncrement,
  type FirestoreWritePrecondition,
} from '../interfaces/firestore-write.interface';
import { deriveFirestoreDocumentId } from '../utils/firestore-deterministic-id';
import { resolveSoftDeleteFieldFromMetadata } from './firestore-entity-metadata';
import { runFirestoreCount, runFirestoreQuery } from './firestore-query-runner';
import { translateDnfBranch } from './firestore-where.translator';
import {
  getAmbientFirestoreTransaction,
  getAmbientFirestoreTransactionOwner,
} from '../transaction/firestore-transaction-context';
import { runInFirestoreTransaction } from '../transaction/run-in-firestore-transaction';

export interface FirestoreRepositoryOptions<Entity extends PlainLiteralObject> {
  readonly entityKey: string;
  readonly collection: string;
  readonly metadata: RepositoryMetadataInterface<Entity>;
  readonly backend: FirestoreBackend;
  readonly transactionKey?: string;
  /** Derive document id from this field when `id` is omitted on create. */
  readonly uniqueDocumentIdField?: string;
}

/** Firestore-only update options (CAS precondition). */
export interface FirestoreRepositoryUpdateOptions
  extends RepositoryUpdateOptions {
  readonly precondition?: FirestoreWritePrecondition;
}

type StoreClient = Pick<
  FirestoreBackend,
  'get' | 'create' | 'set' | 'delete' | 'queryBranch' | 'countBranch'
>;

export class FirestoreRepository<
  Entity extends PlainLiteralObject,
> extends RepositoryAdapter<Entity> {
  readonly metadata: RepositoryMetadataInterface<Entity>;
  private readonly softDeleteField?: string;
  private readonly transactionKey: string;

  constructor(private readonly options: FirestoreRepositoryOptions<Entity>) {
    super(options.entityKey);
    this.metadata = options.metadata;
    this.softDeleteField = resolveSoftDeleteFieldFromMetadata(options.metadata);
    this.transactionKey =
      options.transactionKey ?? FIRESTORE_DEFAULT_TRANSACTION_KEY;
  }

  /**
   * Preferred transactional path for Firestore: `fn` runs inside the SDK
   * callback so contention retries re-execute the body. Nested repository
   * calls join via ambient ALS — no `{ ctx }` required.
   *
   * Do not use `TransactionScope` / `transactional: true` for contended
   * read-modify-write; that bridge refuses Firestore retries.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return runInFirestoreTransaction(this.options.backend, fn);
  }

  /**
   * Atomic field increment via `FieldValue.increment`. Writes only the named
   * field — never a full-entity merge — so concurrent updates to other fields
   * are not clobbered. Defaults to `exists: true` so a missing document fails
   * the write instead of being created. Pass `{ precondition: undefined }` to
   * opt out. Returns void; re-read if you need the new counter value.
   */
  async increment(
    entity: Entity,
    field: keyof Entity & string,
    delta: number,
    options?: {
      readonly ctx?: PlainLiteralObject;
      readonly precondition?: FirestoreWritePrecondition;
    },
  ): Promise<void> {
    const client = await this.resolveClient(options?.ctx);
    const id = this.resolveId(entity);
    const precondition =
      options !== undefined && 'precondition' in options
        ? options.precondition
        : { exists: true };
    await client.set(
      this.options.collection,
      id,
      { [field]: firestoreIncrement(delta) },
      true,
      precondition,
    );
  }

  /**
   * CAS update with an explicit write precondition. Prefer this over casting
   * through {@link update} so the precondition stays on the typed surface.
   */
  async updateWithPrecondition(
    entity: Entity,
    data: DeepPartial<Entity>,
    options: {
      readonly precondition: FirestoreWritePrecondition;
      readonly ctx?: PlainLiteralObject;
    },
  ): Promise<Entity> {
    return this.permeator.update.permeate(
      data,
      (scoped) => this.doUpdate(entity, scoped, options),
      this.entityCtx(options.ctx),
    );
  }

  protected async doFind(
    options?: RepositoryFindOptions<Entity>,
  ): Promise<Entity[]> {
    const client = await this.resolveClient(options?.ctx);
    const rows = await runFirestoreQuery(
      client,
      this.options.collection,
      this.buildQueryRequest(options),
    );
    return rows.map((row) => this.fromStore(row));
  }

  protected async doFindOne(
    options: RepositoryFindOneOptions<Entity>,
  ): Promise<Entity | null> {
    const rows = await this.doFind({ ...options, take: 1 });
    return rows[0] ?? null;
  }

  protected async doCount(
    options?: RepositoryFindOptions<Entity>,
  ): Promise<number> {
    const client = await this.resolveClient(options?.ctx);
    const request = this.buildQueryRequest(options);
    return runFirestoreCount(client, this.options.collection, {
      branches: request.branches,
      withDeleted: request.withDeleted,
      softDeleteField: request.softDeleteField,
    });
  }

  protected async doFindAndCount(
    options?: RepositoryFindOptions<Entity>,
  ): Promise<[Entity[], number]> {
    const client = await this.resolveClient(options?.ctx);
    const request = this.buildQueryRequest(options);
    const [rows, total] = await Promise.all([
      runFirestoreQuery(client, this.options.collection, request),
      runFirestoreCount(client, this.options.collection, {
        branches: request.branches,
        withDeleted: request.withDeleted,
        softDeleteField: request.softDeleteField,
      }),
    ]);
    return [rows.map((row) => this.fromStore(row)), total];
  }

  protected async doCreate(
    entity: DeepPartial<Entity>,
    options?: RepositoryCreateOptions,
  ): Promise<Entity> {
    const client = await this.resolveClient(options?.ctx);
    const id = this.resolveId(entity);
    const stored = this.toStore({ ...entity, id } as DeepPartial<Entity>, {
      materializeSoftDeleteNull: true,
    });
    await client.create(this.options.collection, id, stored);
    return this.fromStore(stored);
  }

  protected async doCreateMany(
    entities: DeepPartial<Entity>[],
    options?: RepositoryCreateOptions,
  ): Promise<Entity[]> {
    if (entities.length === 0) {
      return [];
    }

    const prepared = entities.map((entity) => {
      const id = this.resolveId(entity);
      const stored = this.toStore({ ...entity, id } as DeepPartial<Entity>, {
        materializeSoftDeleteNull: true,
      });
      return { id, stored };
    });

    if (await this.isInTransaction(options?.ctx)) {
      // Firestore: all reads before all writes. Hoist existence checks, then
      // create with skipExistenceRead so the 2nd+ item does not read-after-write.
      const client = await this.resolveClient(options?.ctx);
      const seen = new Set<string>();
      for (const row of prepared) {
        if (seen.has(row.id)) {
          throw new FirestoreDuplicateIdException(
            this.options.collection,
            row.id,
          );
        }
        seen.add(row.id);
        const existing = await client.get(this.options.collection, row.id);
        if (existing !== null) {
          throw new FirestoreDuplicateIdException(
            this.options.collection,
            row.id,
          );
        }
      }
      for (const row of prepared) {
        await client.create(this.options.collection, row.id, row.stored, {
          skipExistenceRead: true,
        });
      }
      return prepared.map((row) => this.fromStore(row.stored));
    }

    for (
      let offset = 0;
      offset < prepared.length;
      offset += FIRESTORE_MAX_BATCH_WRITES
    ) {
      const chunk = prepared.slice(offset, offset + FIRESTORE_MAX_BATCH_WRITES);
      await this.options.backend.writeBatch(
        chunk.map((row) => ({
          op: 'create' as const,
          collection: this.options.collection,
          id: row.id,
          data: row.stored,
        })),
      );
    }

    return prepared.map((row) => this.fromStore(row.stored));
  }

  protected async doUpdate(
    entity: Entity,
    data: DeepPartial<Entity>,
    options?: FirestoreRepositoryUpdateOptions,
  ): Promise<Entity> {
    const client = await this.resolveClient(options?.ctx);
    const id = this.resolveId(entity);
    const merged = this.toStore({ ...entity, ...data, id });
    await client.set(
      this.options.collection,
      id,
      merged,
      true,
      options?.precondition,
    );
    return this.fromStore(merged);
  }

  protected async doUpsert(
    entity: DeepPartial<Entity>,
    options?: RepositoryUpsertOptions,
  ): Promise<Entity> {
    // The soft-delete decision below reads the document, then writes based on
    // what it saw. Outside a transaction those two calls hit the raw backend
    // non-atomically: a concurrent create+soft-delete landing between them
    // would let this write's materialized `null` resurrect the row. Open our
    // own transaction so the decision and the write are atomic (SDK retries
    // re-execute on contention). Skipped when the entity already carries the
    // soft-delete field (the write value is caller-supplied, not read-derived —
    // no race) or there is no soft-delete field at all. Also skipped when any
    // Firestore transaction is already ambient: a same-backend one already
    // makes this atomic, and a foreign-backend one must keep writing through
    // this repository's own backend (see the cross-backend test) rather than
    // fail the span guard in runInFirestoreTransaction.
    const softDeleteField = this.softDeleteField;
    const needsSoftDeleteRead =
      softDeleteField !== undefined &&
      (entity as Record<string, unknown>)[softDeleteField] === undefined;
    if (
      needsSoftDeleteRead &&
      getAmbientFirestoreTransactionOwner() === undefined &&
      !(await this.isInTransaction(options?.ctx))
    ) {
      return this.transaction(() => this.doUpsert(entity, options));
    }
    const client = await this.resolveClient(options?.ctx);
    const id = this.resolveId(entity);
    // An upsert that lands on a NEW document writes with `merge: true`, so
    // without the marker the row has no soft-delete field at all and
    // `field == null` never matches it — invisible to every default list.
    // Materializing unconditionally would resurrect soft-deleted rows, so
    // the state of the existing document decides.
    const stored = this.toStore({ ...entity, id } as DeepPartial<Entity>, {
      materializeSoftDeleteNull: await this.isMissingDocument(client, id),
    });
    await client.set(this.options.collection, id, stored, true);
    return this.fromStore(stored);
  }

  protected async doReplace(
    entity: Entity,
    data: DeepPartial<Entity>,
    options?: RepositoryUpdateOptions,
  ): Promise<Entity> {
    const id = this.resolveId(entity);
    // Replace overwrites the whole document (`merge: false`). Carry the
    // soft-delete state from the loaded entity when present; otherwise read
    // the live document so a hand-built `{ id }` entity cannot invent `null`
    // over a soft-deleted row.
    const payload = this.carrySoftDeleteField({ ...data, id }, entity);
    // A read to decide materialization only happens when the payload still
    // lacks the soft-delete field. When it does, open a transaction so a
    // concurrent create+soft-delete cannot slip between the read and the write
    // and get resurrected (see doUpsert, including the ambient-owner guard).
    // The common carry path already has the field, reads nothing, and skips
    // the transaction.
    const softDeleteField = this.softDeleteField;
    const needsSoftDeleteRead =
      softDeleteField !== undefined &&
      (payload as Record<string, unknown>)[softDeleteField] === undefined;
    if (
      needsSoftDeleteRead &&
      getAmbientFirestoreTransactionOwner() === undefined &&
      !(await this.isInTransaction(options?.ctx))
    ) {
      return this.transaction(() => this.doReplace(entity, data, options));
    }
    const client = await this.resolveClient(options?.ctx);
    const materializeSoftDeleteNull =
      await this.shouldMaterializeSoftDeleteOnReplace(client, id, payload);

    const stored = this.toStore(payload, { materializeSoftDeleteNull });
    await client.set(this.options.collection, id, stored, false);
    return this.fromStore(stored);
  }

  protected async doDelete(
    entity: Entity,
    options?: RepositoryDeleteOptions,
  ): Promise<Entity> {
    const client = await this.resolveClient(options?.ctx);
    const id = this.resolveId(entity);
    await client.delete(this.options.collection, id);
    return entity;
  }

  protected async doDeleteMany(
    entities: Entity[],
    options?: RepositoryDeleteOptions,
  ): Promise<Entity[]> {
    if (entities.length === 0) {
      return entities;
    }

    if (await this.isInTransaction(options?.ctx)) {
      for (const entity of entities) {
        await this.doDelete(entity, options);
      }
      return entities;
    }

    const ids = entities.map((entity) => this.resolveId(entity));
    for (
      let offset = 0;
      offset < ids.length;
      offset += FIRESTORE_MAX_BATCH_WRITES
    ) {
      const chunk = ids.slice(offset, offset + FIRESTORE_MAX_BATCH_WRITES);
      await this.options.backend.writeBatch(
        chunk.map((id) => ({
          op: 'delete' as const,
          collection: this.options.collection,
          id,
        })),
      );
    }
    return entities;
  }

  protected async doSoftDelete(
    entity: Entity,
    options?: RepositoryDeleteOptions,
  ): Promise<Entity> {
    const field = this.requireSoftDeleteField();
    const client = await this.resolveClient(options?.ctx);
    const id = this.resolveId(entity);
    const removedAt = new Date();
    const patch = { [field]: removedAt } as DeepPartial<Entity>;
    const merged = this.toStore({ ...entity, ...patch, id });
    await client.set(this.options.collection, id, merged, true);
    return this.fromStore(merged);
  }

  protected async doRestore(
    entity: Entity,
    options?: RepositoryRestoreOptions,
  ): Promise<Entity> {
    const field = this.requireSoftDeleteField();
    const client = await this.resolveClient(options?.ctx);
    const id = this.resolveId(entity);
    const patch = { [field]: null } as DeepPartial<Entity>;
    const merged = this.toStore({ ...entity, ...patch, id });
    await client.set(this.options.collection, id, merged, true);
    return this.fromStore(merged);
  }

  transform(entityLike: DeepPartial<Entity>): Entity {
    return { ...entityLike } as Entity;
  }

  merge(
    mergeIntoEntity: Entity,
    ...entityLikes: DeepPartial<Entity>[]
  ): Entity {
    return Object.assign(mergeIntoEntity, ...entityLikes);
  }

  private async resolveClient(ctx?: PlainLiteralObject): Promise<StoreClient> {
    const handle = await this.resolveTransactionHandle(ctx);
    return handle ?? this.options.backend;
  }

  private async resolveTransactionHandle(
    ctx?: PlainLiteralObject,
  ): Promise<FirestoreTransactionHandle | null> {
    // Callback-scoped API (runInFirestoreTransaction) — preferred under
    // contention. Only joined when the ambient transaction belongs to THIS
    // repository's backend; a handle from another backend targets another
    // database, so this repository writes through its own backend instead.
    const ambient = getAmbientFirestoreTransaction(this.options.backend);
    if (ambient !== undefined) {
      return ambient;
    }

    // Imperative TransactionScope bridge — fail-closed on Firestore retry.
    const context = AppContextHost.from(ctx);
    if (!context.supports(TrxCtx)) {
      return null;
    }
    const { trx } = context.with(TrxCtx);
    if (!trx?.isSupported) {
      return null;
    }
    const tx = await trx.getOrStart(this.transactionKey);
    return tx.getClient<FirestoreTransactionHandle>();
  }

  private buildQueryRequest(
    options?: RepositoryFindOptions<Entity>,
  ): FirestoreQueryRequest {
    return {
      branches: this.resolveBranches(options?.where),
      orderBy: mapOrderBy(options?.order),
      skip: options?.skip,
      take: options?.take,
      withDeleted: options?.withDeleted,
      softDeleteField: this.softDeleteField,
    };
  }

  private resolveBranches(where?: WhereClause) {
    if (!where) {
      return [{ filters: [], postFilters: [] }];
    }
    return this.toDnf(where).map((conditions) =>
      translateDnfBranch(conditions.filter(isWhereCondition)),
    );
  }

  private requireSoftDeleteField(): string {
    if (!this.softDeleteField) {
      throw new Error(
        `Firestore adapter: entity "${this.options.entityKey}" has no soft-delete column — add "${FIRESTORE_DEFAULT_SOFT_DELETE_FIELD}" or "${FIRESTORE_ALT_SOFT_DELETE_FIELD}" to the class.`,
      );
    }
    return this.softDeleteField;
  }

  /**
   * True when the soft-delete marker has to be invented for `id`. Skips the
   * extra read when the entity is not soft-deletable or already carries the
   * field.
   */
  private async isMissingDocument(
    client: StoreClient,
    id: string,
  ): Promise<boolean> {
    if (this.softDeleteField === undefined) {
      return false;
    }
    const existing = await client.get(this.options.collection, id);
    return existing === null;
  }

  /**
   * Decide whether replace may invent `softDeleteField: null`. Never invents
   * over an existing soft-deleted (or live) document when the caller omitted
   * the field — including hand-built `{ id }` entities.
   */
  private async shouldMaterializeSoftDeleteOnReplace(
    client: StoreClient,
    id: string,
    payload: DeepPartial<Entity>,
  ): Promise<boolean> {
    const field = this.softDeleteField;
    if (field === undefined) {
      return false;
    }
    const record: Record<string, unknown> = { ...payload };
    if (record[field] !== undefined) {
      return false;
    }
    const existing = await client.get(this.options.collection, id);
    if (existing === null) {
      return true;
    }
    if (existing[field] !== undefined) {
      // Mutate payload via carry path: stash store value onto the object
      // the caller already built so toStore persists it.
      (payload as Record<string, unknown>)[field] = existing[field];
      return false;
    }
    // Legacy doc missing the field — materialize so it stays listable.
    return true;
  }

  private carrySoftDeleteField(
    target: DeepPartial<Entity>,
    source: Entity,
  ): DeepPartial<Entity> {
    const field = this.softDeleteField;
    if (field === undefined) {
      return target;
    }
    const next: Record<string, unknown> = { ...target };
    // Explicit `undefined` (common from DTO mapping) is "not provided".
    if (next[field] !== undefined) {
      return target;
    }
    const current: Record<string, unknown> = { ...source };
    if (current[field] === undefined) {
      return target;
    }
    next[field] = current[field];
    return next as DeepPartial<Entity>;
  }

  private async isInTransaction(ctx?: PlainLiteralObject): Promise<boolean> {
    return (await this.resolveTransactionHandle(ctx)) !== null;
  }

  private resolveId(entity: DeepPartial<Entity> | Entity): string {
    const candidate = (entity as { readonly id?: string }).id;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
    const uniqueField = this.options.uniqueDocumentIdField;
    if (uniqueField !== undefined) {
      const record: Record<string, unknown> = { ...entity };
      return deriveFirestoreDocumentId(record[uniqueField]);
    }
    return randomUUID();
  }

  /**
   * `Date` values are handed to the backend AS DATES. Firestore has a
   * native `Timestamp` type and the admin SDK maps `Date` onto it both
   * ways, so the type survives the round trip and no reconstruction is
   * needed on read.
   *
   * This used to write `value.toISOString()`, which threw the type away
   * — and `fromStore` then tried to guess it back from the field name
   * (`startsWith('date') || endsWith('At')`). That made the returned
   * TYPE depend on the field NAME: `dateCreated` came back a `Date`,
   * `birthday` and `validFrom` came back strings.
   *
   * Soft-delete null is materialized **only on create**. Doing it on
   * update/upsert/replace with `merge: true` would resurrect soft-deleted
   * rows whenever the caller omitted the field (e.g. `update({ id }, patch)`).
   */
  private toStore(
    entity: DeepPartial<Entity>,
    options?: { readonly materializeSoftDeleteNull?: boolean },
  ): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entity)) {
      if (value === undefined) {
        continue;
      }
      next[key] = value;
    }
    const id = (entity as { readonly id?: string }).id;
    if (typeof id === 'string') {
      next.id = id;
    }
    if (
      options?.materializeSoftDeleteNull === true &&
      this.softDeleteField !== undefined &&
      !(this.softDeleteField in next)
    ) {
      next[this.softDeleteField] = null;
    }
    return next;
  }

  private fromStore(row: Record<string, unknown>): Entity {
    return { ...row } as Entity;
  }
}

function mapOrderBy<Entity extends PlainLiteralObject>(
  order?: RepositoryFindOptions<Entity>['order'],
): FirestoreOrderBy[] | undefined {
  if (!order || order.length === 0) {
    return undefined;
  }
  return order.map((clause) => ({
    field: clause.field,
    direction: clause.order === SortOrder.DESC ? 'desc' : 'asc',
  }));
}

/** Narrows to this adapter instance (e.g. for Firestore-only helpers). */
export function isFirestoreRepository<Entity extends PlainLiteralObject>(
  repo: unknown,
): repo is FirestoreRepository<Entity> {
  return repo instanceof FirestoreRepository;
}
