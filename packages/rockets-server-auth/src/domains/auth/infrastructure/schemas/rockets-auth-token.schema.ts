import {
  localLoginSchema,
  refreshSchema,
} from '@concepta/nestjs-authentication';
import { withOpenApi } from '@concepta/rockets-core';

// Upstream ships these bodies without an OpenAPI id, which would inline
// them into every route. Named here so client generators keep the
// `LocalLoginDto` / `RefreshDto` components the contract always had.

/** `POST /token/password` body. */
export const rocketsAuthLocalLoginSchema = withOpenApi(
  localLoginSchema,
  'LocalLoginDto',
);

/** `POST /token/refresh` body. */
export const rocketsAuthRefreshSchema = withOpenApi(
  refreshSchema,
  'RefreshDto',
);
