import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/**
 * `PATCH /me` body: the app's userMetadata update schema under
 * `userMetadata`. Named `UserUpdateDto` — the component name the
 * hand-written DTO carried.
 */
export function meUpdateSchema<U extends z.ZodType>(userMetadataUpdate: U) {
  return withOpenApi(
    z.object({ userMetadata: userMetadataUpdate.optional() }),
    'UserUpdateDto',
  );
}

/**
 * `/me` response: the authorized user's identity plus the app's
 * userMetadata response projection — `null` when no metadata row exists
 * yet. Serialized by this schema, so a userMetadata column hidden with
 * `dto: { response: false }` stays hidden on `/me` too.
 */
export function meResponseSchema<R extends z.ZodType>(userMetadataResponse: R) {
  return withOpenApi(
    z.object({
      id: z.string().meta({ description: 'User ID from auth provider' }),
      sub: z.string().meta({ description: 'User subject from auth provider' }),
      email: z
        .string()
        .optional()
        .meta({ description: 'User email from auth provider' }),
      userRoles: z
        .array(z.object({ role: z.object({ name: z.string() }) }))
        .optional()
        .meta({ description: 'User roles from auth provider' }),
      // Open BY DESIGN, and the one field on this response that is: the
      // keys are the identity provider's and the values are whatever the
      // adapter's `getUser` puts there, so nothing here validates them.
      // The declared key is the boundary — `claims` carries what the
      // adapter hands over, and an adapter that puts internal state on it
      // publishes that to the authenticated caller. `z.json()` was tried
      // and reverted: it adds a recursive component to every generated
      // client for a value this schema still does not constrain.
      claims: z.record(z.string(), z.unknown()).optional().meta({
        description:
          'User claims from the auth provider, verbatim — not validated',
      }),
      userMetadata: userMetadataResponse.nullable(),
    }),
    'UserResponseDto',
  );
}
