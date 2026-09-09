import {
  withOpenApi,
  type RocketsUserMetadataConfig,
} from '@concepta/rockets-core';
import { z } from 'zod';
import { StubUserMetadataEntity } from '../entities/stub-user-metadata.entity';

/**
 * `PATCH /me` userMetadata body — the writable columns of
 * {@link UserMetadataEntityFixture}. `username` carries a custom message so
 * specs can prove the Rockets exception factory forwards schema messages.
 */
export const userMetadataUpdateSchemaFixture = withOpenApi(
  z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    bio: z.string().optional(),
    location: z.string().optional(),
    username: z
      .string()
      .min(5, 'Username must be at least 5 characters long')
      .optional(),
  }),
  'UserMetadataUpdateDto',
);

/**
 * `/me` userMetadata projection. Deliberately omits `version`, `dateDeleted`
 * and the other columns the in-memory row carries: specs assert those never
 * reach the wire.
 */
export const userMetadataResponseSchemaFixture = withOpenApi(
  z.object({
    id: z.string(),
    userId: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    bio: z.string().optional(),
    location: z.string().optional(),
    username: z.string().optional(),
    dateCreated: z.date(),
    dateUpdated: z.date(),
  }),
  'UserMetadataResponseDto',
);

export const userMetadataConfigFixture: RocketsUserMetadataConfig = {
  entity: StubUserMetadataEntity,
  updateSchema: userMetadataUpdateSchemaFixture,
  responseSchema: userMetadataResponseSchemaFixture,
};
