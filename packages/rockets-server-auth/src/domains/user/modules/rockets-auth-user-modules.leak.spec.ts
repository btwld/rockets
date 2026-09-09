import { describe, it, expect } from 'vitest';
import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';
import { f } from '@concepta/rockets-core/zod';
import { RocketsAuthSignUpModule } from './rockets-auth-signup.module';
import { RocketsAuthAdminModule } from './rockets-auth-admin.module';
import { rocketsAuthUserSchema } from '../infrastructure/schemas/rockets-auth-user.schema';
import { rocketsAuthUserMetadataResponseSchema } from '../infrastructure/schemas/rockets-auth-user-metadata.schema';

// A consumer-supplied `userCrud.model` reaches upstream CRUD serialization
// directly (no `defineResource` projection), so a hidden field inside it
// would ship on `POST /signup` and `/admin/users` — rejected at boot.
const leakyModel = withOpenApi(
  rocketsAuthUserSchema(rocketsAuthUserMetadataResponseSchema).extend({
    secret: f.string({ dto: { response: false } }),
  }),
  'LeakyUserDto',
);

// An open model (`.catchall()` / `.passthrough()`) would ship every column.
const openModel = withOpenApi(
  rocketsAuthUserSchema(rocketsAuthUserMetadataResponseSchema).catchall(
    z.unknown(),
  ),
  'OpenUserDto',
);

describe('rockets-auth user CRUD modules reject a leaky model', () => {
  it('rejects an OPEN model on signup and admin', () => {
    expect(() =>
      RocketsAuthSignUpModule.register({ model: openModel }),
    ).toThrow(/is open at/);
    expect(() => RocketsAuthAdminModule.register({ model: openModel })).toThrow(
      /is open at/,
    );
  });

  it('RocketsAuthSignUpModule.register', () => {
    expect(() =>
      RocketsAuthSignUpModule.register({ model: leakyModel }),
    ).toThrow(/hand-written response schema contains a field/);
  });

  it('RocketsAuthAdminModule.register', () => {
    expect(() =>
      RocketsAuthAdminModule.register({ model: leakyModel }),
    ).toThrow(/hand-written response schema contains a field/);
  });
});
