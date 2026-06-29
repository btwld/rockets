import { randomUUID } from 'crypto';
import type { DeepPartial } from '@concepta/nestjs-core';
import {
  isWhereCondition,
  RepositoryAdapter,
  SortOrder,
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
import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type {
  FirestoreOrderBy,
  FirestoreQueryRequest,
} from '../interfaces/firestore-query.interface';
import { resolveSoftDeleteFieldFromMetadata } from './firestore-entity-metadata';
import { runFirestoreCount, runFirestoreQuery } from './firestore-query-runner';
import { translateDnfBranch } from './firestore-where.translator';

export interface FirestoreRepositoryOptions<Entity extends PlainLiteralObject> {
  readonly entityKey: string;
  readonly collection: string;
  readonly metadata: RepositoryMetadataInterface<Entity>;
  readonly backend: FirestoreBackend;
}

export class FirestoreRepository<
  Entity extends PlainLiteralObject,
> extends RepositoryAdapter<Entity> {
  readonly metadata: RepositoryMetadataInterface<Entity>;
  private readonly softDeleteField?: string;

  constructor(private readonly options: FirestoreRepositoryOptions<Entity>) {
    super(options.entityKey);
    this.metadata = options.metadata;
    this.softDeleteField = resolveSoftDeleteFieldFromMetadata(options.metadata);
  }

  protected async doFind(
    options?: RepositoryFindOptions<Entity>,
  ): Promise<Entity[]> {
    const rows = await runFirestoreQuery(
      this.options.backend,
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
    const request = this.buildQueryRequest(options);
    return runFirestoreCount(this.options.backend, this.options.collection, {
      branches: request.branches,
      withDeleted: request.withDeleted,
      softDeleteField: request.softDeleteField,
    });
  }

  protected async doFindAndCount(
    options?: RepositoryFindOptions<Entity>,
  ): Promise<[Entity[], number]> {
    const request = this.buildQueryRequest(options);
    const [rows, total] = await Promise.all([
      runFirestoreQuery(this.options.backend, this.options.collection, request),
      runFirestoreCount(this.options.backend, this.options.collection, {
        branches: request.branches,
        withDeleted: request.withDeleted,
        softDeleteField: request.softDeleteField,
      }),
    ]);
    return [rows.map((row) => this.fromStore(row)), total];
  }

  protected async doCreate(
    entity: DeepPartial<Entity>,
    _options?: RepositoryCreateOptions,
  ): Promise<Entity> {
    const id = this.resolveId(entity);
    const stored = this.toStore({ ...entity, id } as DeepPartial<Entity>);
    await this.options.backend.set(this.options.collection, id, stored, false);
    return this.fromStore(stored);
  }

  protected async doCreateMany(
    entities: DeepPartial<Entity>[],
    options?: RepositoryCreateOptions,
  ): Promise<Entity[]> {
    const created: Entity[] = [];
    for (const entity of entities) {
      created.push(await this.doCreate(entity, options));
    }
    return created;
  }

  protected async doUpdate(
    entity: Entity,
    data: DeepPartial<Entity>,
    _options?: RepositoryUpdateOptions,
  ): Promise<Entity> {
    const id = this.resolveId(entity);
    const merged = this.toStore({ ...entity, ...data, id });
    await this.options.backend.set(this.options.collection, id, merged, true);
    return this.fromStore(merged);
  }

  protected async doUpsert(
    entity: DeepPartial<Entity>,
    _options?: RepositoryUpsertOptions,
  ): Promise<Entity> {
    const id = this.resolveId(entity);
    const stored = this.toStore(entity);
    await this.options.backend.set(this.options.collection, id, stored, true);
    return this.fromStore(stored);
  }

  protected async doReplace(
    entity: Entity,
    data: DeepPartial<Entity>,
    _options?: RepositoryUpdateOptions,
  ): Promise<Entity> {
    const id = this.resolveId(entity);
    const stored = this.toStore({ ...data, id });
    await this.options.backend.set(this.options.collection, id, stored, false);
    return this.fromStore(stored);
  }

  protected async doDelete(
    entity: Entity,
    _options?: RepositoryDeleteOptions,
  ): Promise<Entity> {
    const id = this.resolveId(entity);
    await this.options.backend.delete(this.options.collection, id);
    return entity;
  }

  protected async doDeleteMany(
    entities: Entity[],
    options?: RepositoryDeleteOptions,
  ): Promise<Entity[]> {
    for (const entity of entities) {
      await this.doDelete(entity, options);
    }
    return entities;
  }

  protected async doSoftDelete(
    entity: Entity,
    _options?: RepositoryDeleteOptions,
  ): Promise<Entity> {
    const field = this.requireSoftDeleteField();
    const id = this.resolveId(entity);
    const removedAt = new Date().toISOString();
    const patch = { [field]: removedAt } as DeepPartial<Entity>;
    const merged = this.toStore({ ...entity, ...patch, id });
    await this.options.backend.set(this.options.collection, id, merged, true);
    return this.fromStore(merged);
  }

  protected async doRestore(
    entity: Entity,
    _options?: RepositoryRestoreOptions,
  ): Promise<Entity> {
    const field = this.requireSoftDeleteField();
    const id = this.resolveId(entity);
    const patch = { [field]: null } as DeepPartial<Entity>;
    const merged = this.toStore({ ...entity, ...patch, id });
    await this.options.backend.set(this.options.collection, id, merged, true);
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

  private resolveId(entity: DeepPartial<Entity> | Entity): string {
    const candidate = (entity as { readonly id?: string }).id;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
    return randomUUID();
  }

  private toStore(entity: DeepPartial<Entity>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entity)) {
      if (value === undefined) {
        continue;
      }
      next[key] = value instanceof Date ? value.toISOString() : value;
    }
    const id = (entity as { readonly id?: string }).id;
    if (typeof id === 'string') {
      next.id = id;
    }
    return next;
  }

  private fromStore(row: Record<string, unknown>): Entity {
    const next: Record<string, unknown> = { ...row };
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === 'string' && isIsoDateString(value)) {
        const column = this.metadata.columns.find((col) => col.name === key);
        if (column && (key.startsWith('date') || key.endsWith('At'))) {
          next[key] = new Date(value);
        }
      }
    }
    return next as Entity;
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

function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Narrows to this adapter instance (e.g. for Firestore-only helpers). */
export function isFirestoreRepository<Entity extends PlainLiteralObject>(
  repo: unknown,
): repo is FirestoreRepository<Entity> {
  return repo instanceof FirestoreRepository;
}
