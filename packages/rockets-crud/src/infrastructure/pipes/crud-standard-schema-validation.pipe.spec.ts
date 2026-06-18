import { BadRequestException } from '@nestjs/common';
import {
  CrudStandardSchemaValidationPipe,
  getStandardSchema,
  StandardSchemaV1,
} from './crud-standard-schema-validation.pipe';

/**
 * Unit spec (justified: the pipe is pure logic with no Nest wiring).
 * Uses a hand-rolled Standard Schema fake — rockets-crud must stay
 * vendor-neutral, so the contract is tested without zod/valibot.
 */
describe(CrudStandardSchemaValidationPipe.name, () => {
  const fakeSchema: StandardSchemaV1<{ name: string }> = {
    '~standard': {
      version: 1,
      vendor: 'fake',
      validate: (value: unknown) => {
        const name =
          typeof value === 'object' && value !== null
            ? Reflect.get(value, 'name')
            : undefined;
        if (typeof name !== 'string' || name.length === 0) {
          return {
            issues: [{ message: 'name is required', path: ['name'] }],
          };
        }
        // parsed output: unknown keys stripped
        return { value: { name } };
      },
    },
  };

  it('returns the schema output value on success (stripped)', async () => {
    const pipe = new CrudStandardSchemaValidationPipe(fakeSchema);
    await expect(
      pipe.transform({ name: 'ok', sneaky: 'drop' }),
    ).resolves.toEqual({ name: 'ok' });
  });

  it('throws BadRequestException with path-prefixed messages on issues', async () => {
    const pipe = new CrudStandardSchemaValidationPipe(fakeSchema);
    await expect(pipe.transform({})).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({})).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: ['name: name is required'],
        error: 'Bad Request',
      },
    });
  });

  it('supports async validate()', async () => {
    const asyncSchema: StandardSchemaV1<string> = {
      '~standard': {
        version: 1,
        vendor: 'fake-async',
        validate: async (value: unknown) =>
          typeof value === 'string'
            ? { value }
            : { issues: [{ message: 'not a string' }] },
      },
    };
    const pipe = new CrudStandardSchemaValidationPipe(asyncSchema);
    await expect(pipe.transform('x')).resolves.toBe('x');
    await expect(pipe.transform(1)).rejects.toThrow(BadRequestException);
  });

  describe(getStandardSchema.name, () => {
    it('detects a DTO class carrying a static Standard Schema', () => {
      class Dto {
        static schema = fakeSchema;
      }
      expect(getStandardSchema(Dto)).toBe(fakeSchema);
    });

    it('returns undefined for plain DTO classes and non-functions', () => {
      class Plain {}
      expect(getStandardSchema(Plain)).toBeUndefined();
      expect(getStandardSchema(undefined)).toBeUndefined();
      expect(getStandardSchema({ schema: fakeSchema })).toBeUndefined();
    });

    it('rejects schema-shaped objects that are not Standard Schema v1', () => {
      class Dto {
        static schema = { '~standard': { version: 2 } };
      }
      expect(getStandardSchema(Dto)).toBeUndefined();
    });
  });
});
