import { z } from 'zod';
import { baseEntity, f, rocketsFieldMeta } from '@concepta/rockets-core/zod';

/**
 * Source of truth for the tag resource surface. Near-pure module:
 * imports zod and the isomorphic `rocketsFieldMeta` registry, so the
 * same schema can be consumed by frontend code (form validation,
 * generated screens) without dragging in Nest.
 *
 * Field roles are declared via the custom registry (`db` for the
 * server-side compiler, `dto` for per-projection roles, `relation` for
 * cross-resource FKs) — NOT `.meta()`, which would leak them into the
 * OpenAPI document. API extras (`example`) use native `.meta()` on
 * purpose: zod's own JSON Schema generation carries them into Swagger.
 *
 * Timestamps come from `baseEntity` as `z.date()` (`f.createdAt()` /
 * `f.updatedAt()`): rows carry real `Date` objects, the response schema
 * serializes them, and the OpenAPI bridge documents them as
 * `string` / `date-time`. Use `WireRow<typeof tagSchema>` for the JSON
 * shape a client sees.
 *
 * `.optional()` means "may be omitted on write" and compiles to a
 * nullable column; a row written without it reads back as `null`, and
 * responses are validated fail-closed against this same schema — so a
 * response-exposed optional column is declared `.nullable().optional()`.
 */
export const tagSchema = baseEntity({
  name: f.string({ min: 1, max: 100, example: 'vaccinated', unique: true }),
  // zod-only rule: enforced at runtime by the Standard Schema pipe in
  // rockets-crud — this is the fidelity the
  // layer buys. Custom `.refine()` keeps the field as raw zod.
  color: z
    .string()
    .max(20)
    .refine((value) => value.startsWith('#'), 'color must start with "#"')
    .meta({ example: '#ff0000' })
    .register(rocketsFieldMeta, { dto: { response: true } })
    .nullable()
    .optional(),
});

export type Tag = z.infer<typeof tagSchema>;
