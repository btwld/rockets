import type { PlainLiteralObject, Type } from '@nestjs/common';
import type { z } from 'zod';
import type { RocketsRepositoryModuleInterface } from '../../common';

/**
 * User-metadata wiring for Rockets core + server: entity for the dynamic
 * repository, the named zod schemas `/me` validates and serializes with,
 * optional adapter override.
 *
 * Both schemas must be named OpenAPI components (`withOpenApi(schema, id)`
 * as the LAST call); `defineZodUserMetadata` produces them from one
 * schema. The update schema is the shape of `PATCH /me` `userMetadata`;
 * the response schema projects the stored row onto the wire — a column it
 * does not declare never leaves the server.
 */
export interface RocketsUserMetadataConfig {
  readonly entity: Type<PlainLiteralObject>;
  readonly updateSchema: z.ZodType;
  readonly responseSchema: z.ZodType;
  /**
   * Override the root `repository` adapter for the user-metadata table only.
   * Useful when user-metadata lives in a different store than the rest of
   * the app (e.g. Firestore for metadata, TypeORM for everything else).
   */
  readonly repository?: RocketsRepositoryModuleInterface;
}
