import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { z } from 'zod';
import {
  auditableEntity,
  f,
  rocketsEntityMeta,
  rocketsFieldMeta,
} from '@bitwild/rockets-core/zod';
import { compileEntity } from './compile-entity';

function columnsFor(target: Function) {
  return getMetadataArgsStorage().columns.filter((c) => c.target === target);
}

function relationsFor(target: Function) {
  return getMetadataArgsStorage().relations.filter((r) => r.target === target);
}

function uniquesFor(target: Function) {
  return getMetadataArgsStorage().uniques.filter((u) => u.target === target);
}

function indicesFor(target: Function) {
  return getMetadataArgsStorage().indices.filter((i) => i.target === target);
}

describe('compileEntity', () => {
  it('maps scalar fields, audit columns and composite constraints', () => {
    const schema = auditableEntity({
      name: f.string({ min: 1, max: 100, unique: true, index: true }),
      price: z.number().register(rocketsFieldMeta, {
        db: { column: { type: 'decimal', precision: 10, scale: 2 } },
      }),
      attrs: z
        .record(z.string(), z.unknown())
        .register(rocketsFieldMeta, { db: { column: { type: 'simple-json' } } })
        .optional(),
    }).register(rocketsEntityMeta, { unique: [['name', 'version']] });

    const Entity = compileEntity(schema, {
      name: 'CompileScalarEntity',
      table: 'compile_scalars',
    });

    const cols = columnsFor(Entity);
    expect(cols.map((c) => c.propertyName).sort()).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'price',
        'attrs',
        'dateCreated',
        'dateUpdated',
        'dateDeleted',
        'version',
      ]),
    );

    const idCol = cols.find((c) => c.propertyName === 'id');
    expect(idCol?.options?.type).toBe('uuid');
    expect(idCol?.options?.primary).toBe(true);

    const nameCol = cols.find((c) => c.propertyName === 'name');
    expect(nameCol?.options?.unique).toBe(true);

    const priceCol = cols.find((c) => c.propertyName === 'price');
    expect(priceCol?.options?.type).toBe('decimal');
    expect(priceCol?.options?.precision).toBe(10);
    expect(priceCol?.options?.scale).toBe(2);

    expect(uniquesFor(Entity).length).toBeGreaterThan(0);
    expect(indicesFor(Entity).length).toBeGreaterThan(0);
  });

  it('maps FK manyToOne with JoinColumn and onDelete', () => {
    const parentSchema = z.object({
      id: f.pk(),
      name: f.string({ max: 50 }),
    });

    const childSchema = z.object({
      id: f.pk(),
      parentId: f.fk(() => parentSchema, { onDelete: 'CASCADE' }),
    });

    const ParentEntity = compileEntity(parentSchema, {
      name: 'CompileParentEntity',
      table: 'compile_parents',
    });
    const ChildEntity = compileEntity(childSchema, {
      name: 'CompileChildEntity',
      table: 'compile_children',
    });

    const childCols = columnsFor(ChildEntity);
    expect(childCols.some((c) => c.propertyName === 'parentId')).toBe(true);

    const childRels = relationsFor(ChildEntity);
    expect(childRels.some((r) => r.propertyName === 'parent')).toBe(true);
    expect(
      getMetadataArgsStorage().joinColumns.some(
        (j) => j.target === ChildEntity && j.propertyName === 'parent',
      ),
    ).toBe(true);

    expect(ParentEntity.name).toBe('CompileParentEntity');
    expect(ChildEntity.name).toBe('CompileChildEntity');
  });

  it('maps hasMany inverse without a column on the parent', () => {
    const leafSchema = z.object({
      id: f.pk(),
      groupId: f.fk((): unknown => groupSchema, { include: 'never' }),
    });

    const groupSchema = z.object({
      id: f.pk(),
      leaves: f.hasMany(leafSchema, { mappedBy: 'groupId', expose: true }),
    });

    const GroupEntity = compileEntity(groupSchema, {
      name: 'CompileGroupEntity',
      table: 'compile_groups',
    });
    const LeafEntity = compileEntity(leafSchema, {
      name: 'CompileLeafEntity',
      table: 'compile_leaves',
    });

    expect(
      columnsFor(GroupEntity).some((c) => c.propertyName === 'leaves'),
    ).toBe(false);
    expect(
      relationsFor(GroupEntity).some((r) => r.propertyName === 'leaves'),
    ).toBe(true);
    expect(LeafEntity.name).toBe('CompileLeafEntity');
  });

  it('skips compute fields — no column emitted', () => {
    const schema = z.object({
      id: f.pk(),
      slug: f.string({ max: 80 }),
      label: f.compute(f.string({ max: 80 }), (row) => String(row.slug)),
    });

    const Entity = compileEntity(schema, {
      name: 'CompileComputeEntity',
      table: 'compile_compute',
    });

    expect(columnsFor(Entity).map((c) => c.propertyName)).toEqual(
      expect.arrayContaining(['id', 'slug']),
    );
    expect(columnsFor(Entity).some((c) => c.propertyName === 'label')).toBe(
      false,
    );
  });

  it('throws for unsupported zod types without db.column override', () => {
    const schema = z.object({
      id: f.pk(),
      meta: z.record(z.string(), z.unknown()),
    });

    expect(() =>
      compileEntity(schema, {
        name: 'CompileBadEntity',
        table: 'compile_bad',
      }),
    ).toThrow(/Unsupported zod type/);
  });
});
