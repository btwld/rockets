import { describe, it, expect } from 'vitest';
import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import type { SchemaEntityCompiler } from '../common';
import { readSchemaId } from '../common/utils/open-api-schema.util';
import { auditableEntity } from './base-entity';
import { f } from './fields';
import { defineZodUserMetadata } from './zod-user-metadata';

/**
 * `defineZodUserMetadata` used to build its response DTO from the WHOLE
 * schema, bypassing `projectSchema`. Response exposure is opt-in everywhere
 * else, so that second projection path silently leaked every userMetadata
 * column (CWE-200). These tests pin that it shares `zodResource`'s
 * projection, and that the schemas it returns are what `/me` validates and
 * serializes with.
 */
describe('defineZodUserMetadata projections', () => {
  const entityCompiler: SchemaEntityCompiler = {
    compileEntity: (_schema, options) => {
      class GeneratedEntity {}
      Object.defineProperty(GeneratedEntity, 'name', { value: options.name });
      return GeneratedEntity as Type<PlainLiteralObject>;
    },
  };

  /**
   * The declared keys of a named schema. The response schema is a
   * `z.preprocess` pipe when the schema has computed fields; these fixtures
   * have none, so the object is the schema itself.
   */
  const schemaKeys = (schema: z.ZodType): string[] => {
    if (!(schema instanceof z.ZodObject)) {
      throw new Error('expected a z.object() schema');
    }
    return Object.keys(schema.shape);
  };

  const build = (extra: Record<string, z.ZodType>) =>
    defineZodUserMetadata(
      auditableEntity({
        userId: f.string({ max: 255 }),
        ...extra,
      }),
      { entityCompiler },
    );

  it('keeps a dto.response=false column out of the response schema', () => {
    const config = build({
      firstName: f.string(),
      internalNote: f.string({ dto: { response: false } }),
    });

    const keys = schemaKeys(config.responseSchema);
    expect(keys).toContain('firstName');
    expect(keys).not.toContain('internalNote');
  });

  it('hides a column that never opted into the response at all', () => {
    const config = build({
      firstName: f.string(),
      legacyColumn: z.string(),
    });

    expect(schemaKeys(config.responseSchema)).not.toContain('legacyColumn');
  });

  it('still exposes opted-in columns and the base entity fields', () => {
    const config = build({ firstName: f.string() });

    expect(schemaKeys(config.responseSchema)).toEqual(
      expect.arrayContaining(['id', 'userId', 'firstName', 'dateCreated']),
    );
  });

  it('keeps server-managed columns and ownership out of update', () => {
    const config = build({ firstName: f.string() });

    const update = schemaKeys(config.updateSchema);
    expect(update).toContain('firstName');
    expect(update).not.toContain('userId');
    expect(update).not.toContain('id');
    expect(update).not.toContain('dateCreated');
    expect(update).not.toContain('version');
  });

  it('names both schemas as OpenAPI components after the metadata name', () => {
    const config = defineZodUserMetadata(
      auditableEntity({ userId: f.string(), firstName: f.string() }),
      { entityCompiler, name: 'Profile' },
    );

    expect(readSchemaId(config.updateSchema)).toBe('ProfileUpdateDto');
    expect(readSchemaId(config.responseSchema)).toBe('ProfileResponseDto');
    expect(config.entity.name).toBe('ProfileEntity');
  });

  it('the response schema strips a hidden column from a stored row at runtime', async () => {
    const config = build({
      firstName: f.string(),
      internalNote: f.string({ dto: { response: false } }),
    });

    const result = await config.responseSchema['~standard'].validate({
      id: '00000000-0000-4000-8000-000000000001',
      userId: 'u1',
      firstName: 'Ada',
      internalNote: 'must-not-leak',
      dateCreated: new Date('2024-01-15T10:00:00.000Z'),
      dateUpdated: new Date('2024-01-15T10:00:00.000Z'),
      dateDeleted: null,
      version: 1,
    });

    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).not.toHaveProperty('internalNote');
    expect(result.value).toMatchObject({ firstName: 'Ada', userId: 'u1' });
  });
});
