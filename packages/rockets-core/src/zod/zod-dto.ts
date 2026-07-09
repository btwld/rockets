import type { Type } from '@nestjs/common';
import {
  Exclude,
  Expose,
  Transform,
  Type as TransformType,
} from 'class-transformer';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { unwrapField } from './field-meta';

/**
 * DTO classes come straight from `nestjs-zod`'s `createZodDto` — no
 * custom decorator compilation:
 * - Swagger reads the static `_OPENAPI_METADATA_FACTORY` (zod v4's own
 *   `z.toJSONSchema`), the same hook the `@nestjs/swagger` CLI plugin
 *   targets. Apply `cleanupOpenApiDoc` to the built document.
 * - rockets-crud detects the static `schema` (Standard Schema) and
 *   validates bodies with the source zod schema — including rules
 *   class-validator cannot express (`.refine()`, coercions).
 * - Responses flow through the SAME class-transformer interceptor as
 *   handwritten resources, so the class carries the project DTO idiom
 *   (class-level `@Exclude` + per-field `@Expose`, `@Type` for nested
 *   relation projections) — that is what strips write-only fields from
 *   responses with full defineResource parity.
 * Only the class NAME is set here, so Swagger components match the
 * handwritten naming convention.
 */
export function compileDtoClass(
  schema: z.ZodObject,
  name: string,
  nested?: Readonly<Record<string, Type<object>>>,
): Type<object> {
  const cls = createZodDto(schema);
  Object.defineProperty(cls, 'name', { value: name });
  Exclude()(cls);
  const proto: object = cls.prototype;
  for (const [key, field] of Object.entries(schema.shape)) {
    Expose()(proto, key);
    const nestedClass = nested?.[key];
    if (nestedClass !== undefined) {
      TransformType(() => nestedClass)(proto, key);
      continue;
    }
    const { base, meta } = unwrapField(field, `${name}.${key}`);
    const compute = meta.compute;
    if (compute !== undefined) {
      Transform(({ obj }: { obj: Record<string, unknown> }) => compute(obj), {
        toClassOnly: true,
      })(proto, key);
      continue;
    }
    if (
      base instanceof z.ZodRecord ||
      base instanceof z.ZodObject ||
      base instanceof z.ZodUnknown ||
      base instanceof z.ZodAny
    ) {
      const raw = ({ obj }: { obj: Record<string, unknown> }): unknown =>
        obj?.[key];
      Transform(raw, { toClassOnly: true })(proto, key);
      Transform(raw, { toPlainOnly: true })(proto, key);
    }
  }
  return cls;
}

export function namedZodDto<T>(schema: z.ZodObject, name: string): Type<T> {
  const cls = createZodDto(schema);
  Object.defineProperty(cls, 'name', { value: name });
  return cls as unknown as Type<T>;
}
