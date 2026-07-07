import { z } from 'zod';
import { baseEntity, f } from '@bitwild/rockets-core/zod';

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
 * Timestamps are `z.iso.datetime()` — the honest wire format (JSON has
 * no Date) and the only one zod's JSON Schema generation can represent;
 * the generated entity still maps them to real date columns via
 * `db.createdAt` / `db.updatedAt`.
 */
export const tagSchema = baseEntity({
  name: f.string({ min: 1, max: 100, example: 'vaccinated', unique: true }),
  // zod-only rule (no class-validator equivalent): enforced at runtime by
  // the Standard Schema pipe in rockets-crud — this is the fidelity the
  // layer buys. Custom `.refine()` keeps the field as raw zod.
  color: z
    .string()
    .max(20)
    .refine((value) => value.startsWith('#'), 'color must start with "#"')
    .meta({ example: '#ff0000' })
    .optional(),
});

export type Tag = z.infer<typeof tagSchema>;
