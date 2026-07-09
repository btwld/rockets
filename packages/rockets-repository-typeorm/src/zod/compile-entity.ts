import type { PlainLiteralObject, Type } from '@nestjs/common';
import type {
  SchemaEntityCompiler,
  SchemaEntityCompilerOptions,
} from '@bitwild/rockets-core';
import {
  readEntityMeta,
  registerSchemaEntity,
  relationPropertyFor,
  resolveRelationTarget,
  unwrapField,
  RocketsRelationFieldMeta,
  type SchemaPersistenceRow,
} from '@bitwild/rockets-core/zod';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { ColumnOptions } from 'typeorm';
import { z } from 'zod';

/**
 * Compiles a zod object schema into a TypeORM entity class by applying
 * the real decorators programmatically — to TypeORM (and to the dynamic
 * repository layer, which only sees a `Type<PlainLiteralObject>`) the
 * result is indistinguishable from a handwritten entity class. No core
 * or adapter contract changes.
 *
 * Column roles come from the `db` meta namespace:
 * - `pk: true`        → `@PrimaryGeneratedColumn('uuid')` (field must be z.uuid())
 * - `createdAt: true` → `@CreateDateColumn()`
 * - `updatedAt: true` → `@UpdateDateColumn()`
 * - `deletedAt: true` → `@DeleteDateColumn()` (soft-delete support)
 * - `unique: true`    → `@Column({ unique: true })`
 * - `index: true`     → `@Index()`
 * A field carrying `relation` meta becomes the FK uuid column plus a
 * `@ManyToOne`/`@JoinColumn` relation property (see `compileRelation`).
 * Everything else derives from the zod type: string max length → varchar
 * length, `.optional()`/`.nullable()` → nullable column, `.default()` →
 * column default.
 *
 * This is the TypeORM implementation of the adapter-neutral
 * {@link SchemaEntityCompiler} contract — the DB-specific half of the
 * zod layer. The DB-agnostic translation (DTOs, projections, the
 * schema→entity registry) lives in `@bitwild/rockets-core/zod`.
 */
export interface CompileEntityOptions {
  /** Class name, e.g. `TagEntity` — drives `deriveEntityKey`. */
  readonly name: string;
  /** Physical table name, e.g. `tags`. */
  readonly table: string;
}

/**
 * TypeORM implementation of the adapter-neutral
 * {@link SchemaEntityCompiler} contract from `@bitwild/rockets-core`. It
 * narrows the `unknown` schema to a zod object (boot-time error
 * otherwise) and delegates to the typed compiler below. Other adapters
 * implement the same contract with their own representation — a
 * Firestore/JSON compiler is mostly a named class token, no column
 * metadata at all.
 */
export const typeOrmZodEntityCompiler: SchemaEntityCompiler = {
  compileEntity(
    schema: unknown,
    options: SchemaEntityCompilerOptions,
  ): Type<PlainLiteralObject> {
    if (!(schema instanceof z.ZodObject)) {
      throw new Error(
        `[typeOrmZodEntityCompiler] "${options.name}" received a schema ` +
          'that is not a zod object — this compiler only supports zod v4 ' +
          'object schemas.',
      );
    }
    return compileEntity(schema, options);
  },
};

export function compileEntity<S extends z.ZodObject>(
  schema: S,
  options: CompileEntityOptions,
): Type<SchemaPersistenceRow<S>> {
  const cls = class {};
  Object.defineProperty(cls, 'name', { value: options.name });

  for (const [key, field] of Object.entries(schema.shape)) {
    compileColumn(cls, key, field, `${options.name}.${key}`);
  }

  // Schema-level meta → class-level decorators (composite constraints).
  const entityMeta = readEntityMeta(schema);
  for (const columns of entityMeta.unique ?? []) {
    Unique([...columns])(cls);
  }
  for (const columns of entityMeta.indexes ?? []) {
    Index([...columns])(cls);
  }

  Entity(options.table)(cls);
  registerSchemaEntity(schema, cls);
  // Sanctioned boundary assertion: decorators apply the persistence shape at
  // runtime — TS cannot observe them structurally. {@link SchemaPersistenceRow}
  // types loaded rows (ISO datetimes → Date); {@link WireRow} stays the API
  // contract.
  return cls as Type<SchemaPersistenceRow<S>>;
}

function compileColumn(
  cls: Type<object>,
  key: string,
  field: z.ZodType,
  path: string,
): void {
  const proto: object = cls.prototype;
  const { base, optional, nullable, hasDefault, defaultValue, meta } =
    unwrapField(field, path);
  const db = meta.db ?? {};

  // Computed response fields exist only in the document/serialization
  // layer — no persistence at all.
  if (meta.compute !== undefined) {
    return;
  }

  if (db.pk === true) {
    if (!(base instanceof z.ZodUUID)) {
      throw new Error(
        `[compileEntity] "${path}" is marked { db: { pk: true } } but is not ` +
          'z.uuid() — only generated UUID primary keys are supported.',
      );
    }
    PrimaryGeneratedColumn('uuid')(proto, key);
    return;
  }
  if (db.createdAt === true) {
    CreateDateColumn()(proto, key);
    return;
  }
  if (db.updatedAt === true) {
    UpdateDateColumn()(proto, key);
    return;
  }
  if (db.deletedAt === true) {
    DeleteDateColumn()(proto, key);
    return;
  }

  if (meta.relation !== undefined) {
    compileRelation(proto, key, base, {
      relation: meta.relation,
      nullable: optional || nullable,
      index: db.index === true,
      path,
    });
    return;
  }

  const column: ColumnOptions = {
    ...columnTypeFor(base, path, db.column !== undefined),
    nullable: optional || nullable,
  };
  if (db.unique === true) {
    column.unique = true;
  }
  if (hasDefault) {
    column.default = defaultValue;
  }
  if (db.index === true) {
    Index()(proto, key);
  }
  // Raw adapter options win over everything derived — the per-column
  // escape hatch (decimal precision, text/json types, collation, ...).
  Column({ ...column, ...(db.column ?? {}) })(proto, key);
}

interface CompileRelationOptions {
  readonly relation: RocketsRelationFieldMeta;
  readonly nullable: boolean;
  readonly index: boolean;
  readonly path: string;
}

/**
 * Field with relation meta → relation decorators on the entity. The
 * target thunk stays lazy all the way into TypeORM's own type thunk,
 * so circular schema graphs work.
 *
 * - `manyToOne` / `oneToOne` (FK side): plain uuid column under the
 *   field's own name PLUS the relation property joined on that column —
 *   the exact shape of a handwritten junction/FK entity.
 * - `hasMany`: NO column; the field itself becomes the `@OneToMany`
 *   relation property, inverse-bound through the child's `mappedBy` FK
 *   field (`petId` → child property `pet`).
 */
function compileRelation(
  proto: object,
  key: string,
  base: z.ZodType,
  options: CompileRelationOptions,
): void {
  const { relation, nullable, index, path } = options;
  const kind = relation.kind ?? 'manyToOne';
  const eager = relation.eager ?? relation.expose === true;

  if (kind === 'hasMany') {
    if (!(base instanceof z.ZodArray)) {
      throw new Error(
        `[compileEntity] "${path}" declares a hasMany relation but is not ` +
          'z.array(childSchema).',
      );
    }
    const mappedBy = relation.mappedBy;
    if (mappedBy === undefined) {
      throw new Error(
        `[compileEntity] hasMany relation at "${path}" requires "mappedBy" ` +
          '— the FK field on the child schema that points back here.',
      );
    }
    const inverseProperty = relationPropertyFor(
      mappedBy,
      { ...relation, property: undefined },
      path,
    );
    OneToMany(
      () => resolveRelationTarget(relation.target, path),
      (child: PlainLiteralObject) => child[inverseProperty],
      { eager },
    )(proto, key);
    return;
  }

  if (!(base instanceof z.ZodUUID)) {
    throw new Error(
      `[compileEntity] "${path}" declares a ${kind} relation but is not ` +
        'z.uuid() — FK-side relations are declared on the FK column field.',
    );
  }

  Column({ type: 'uuid', nullable })(proto, key);
  if (index) {
    Index()(proto, key);
  }

  const property = relationPropertyFor(key, relation, path);
  const relationOptions = {
    eager,
    ...(relation.onDelete !== undefined ? { onDelete: relation.onDelete } : {}),
  };
  const targetThunk = (): Type<PlainLiteralObject> =>
    resolveRelationTarget(relation.target, path);
  if (kind === 'oneToOne') {
    OneToOne(targetThunk, relationOptions)(proto, property);
  } else {
    ManyToOne(targetThunk, relationOptions)(proto, property);
  }
  JoinColumn({ name: key })(proto, property);
}

function columnTypeFor(
  base: z.ZodType,
  path: string,
  hasOverride: boolean,
): ColumnOptions {
  if (base instanceof z.ZodUUID) {
    return { type: 'uuid' };
  }
  // ISO datetime strings are the WIRE format; the column is a real
  // datetime (rows carry Date objects), matching the handwritten idiom.
  if (base instanceof z.ZodISODateTime) {
    return { type: 'datetime' };
  }
  if (base instanceof z.ZodString || base instanceof z.ZodStringFormat) {
    const maxLength =
      base instanceof z.ZodString || base instanceof z.ZodStringFormat
        ? base.maxLength
        : null;
    return maxLength !== null
      ? { type: 'varchar', length: maxLength }
      : { type: 'varchar' };
  }
  if (base instanceof z.ZodNumber) {
    return base.isInt ? { type: 'integer' } : { type: 'float' };
  }
  if (base instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (base instanceof z.ZodDate) {
    return { type: 'datetime' };
  }
  if (base instanceof z.ZodEnum) {
    return { type: 'varchar' };
  }
  // A raw `db.column` override supplies the type itself — any zod shape
  // is acceptable then (e.g. z.record() persisted as a json column).
  if (hasOverride) {
    return {};
  }
  throw new Error(
    `[compileEntity] Unsupported zod type "${base.constructor.name}" at ` +
      `"${path}" — no column mapping. Provide { db: { column: { type: ... } } } ` +
      'or keep the field out of the persistence schema.',
  );
}
