import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withOpenApi } from '@concepta/nestjs-core';

import { validateRocketsUserMetadataConfig } from './validate-rockets-user-metadata-config';

class UserMetadataEntity {
  id!: string;
}

const responseSchema = withOpenApi(
  z.object({ id: z.uuid(), nickname: z.string() }),
  'UserMetadataResponseDto',
);

const configWith = (updateSchema: z.ZodType) => ({
  entity: UserMetadataEntity,
  updateSchema,
  responseSchema,
});

describe('validateRocketsUserMetadataConfig', () => {
  it('accepts an update schema that declares only app columns', () => {
    expect(() =>
      validateRocketsUserMetadataConfig(
        configWith(
          withOpenApi(
            z.object({ nickname: z.string().optional() }),
            'UserMetadataUpdateDto',
          ),
        ),
      ),
    ).not.toThrow();
  });

  // `PATCH /me` validates the body against this schema and the payload
  // reaches `repo.update(existing, …)`. An accepted `id` hands the store
  // a foreign primary key — a write against a row the caller does not own.
  it.each([
    'id',
    'userId',
    'dateCreated',
    'dateUpdated',
    'dateDeleted',
    'version',
  ])('rejects an update schema declaring the server-managed %s', (field) => {
    expect(() =>
      validateRocketsUserMetadataConfig(
        configWith(
          withOpenApi(
            z.object({
              nickname: z.string().optional(),
              [field]: z.string().optional(),
            }),
            'UserMetadataUpdateDto',
          ),
        ),
      ),
    ).toThrow(new RegExp(`declares server-managed field\\(s\\) ${field}`));
  });
});
