import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';
import { PetSharePermission } from './pet-share.entity';

/**
 * Request/response schemas for the hand-written pet-share controller —
 * same idiom as `src/auth/auth.schema.ts`: wrapped LAST with
 * `withOpenApi(schema, id)` so the class-level Standard Schema pipe
 * validates the body and Swagger emits the named component.
 */
export const petShareCreateSchema = withOpenApi(
  z.object({
    userId: z
      .uuidv4()
      .meta({ description: 'ID of the user the pet is being shared with.' }),
    permission: z.enum(PetSharePermission).optional(),
  }),
  'PetShareCreateDto',
);
export type PetShareCreateBody = z.output<typeof petShareCreateSchema>;

export const petShareResponseSchema = withOpenApi(
  z.object({
    id: z.uuid(),
    petId: z.uuid(),
    userId: z.uuid(),
    permission: z.enum(PetSharePermission),
    dateCreated: z.date(),
  }),
  'PetShareResponseDto',
);
export type PetShareResponse = z.output<typeof petShareResponseSchema>;

/**
 * Swagger-only: `@ApiResponse({ standardSchema })` ignores `isArray`, so the
 * list route documents an unnamed bridged array whose items `$ref` the
 * named component. Serialization still uses the item schema — the
 * serializer interceptor maps arrays per item.
 */
export const petShareListResponseSchema = withOpenApi(
  z.array(petShareResponseSchema),
);
