import {
  recoveryRecoverLoginSchema,
  recoveryRecoverPasswordSchema,
  recoveryUpdatePasswordSchema,
  recoveryValidatePasscodeSchema,
} from '@concepta/nestjs-authentication';
import { withOpenApi } from '@concepta/rockets-core';

// Upstream ships these bodies without an OpenAPI id, which would inline
// them into every route. Named here so client generators keep the
// `Recovery*Dto` components the contract always had.

/** `POST /recovery/login` body. */
export const rocketsAuthRecoveryRecoverLoginSchema = withOpenApi(
  recoveryRecoverLoginSchema,
  'RecoveryRecoverLoginDto',
);

/** `POST /recovery/password` body. */
export const rocketsAuthRecoveryRecoverPasswordSchema = withOpenApi(
  recoveryRecoverPasswordSchema,
  'RecoveryRecoverPasswordDto',
);

/** `POST /recovery/passcode` body. */
export const rocketsAuthRecoveryValidatePasscodeSchema = withOpenApi(
  recoveryValidatePasscodeSchema,
  'RecoveryValidatePasscodeDto',
);

/** `PATCH /recovery/password` body. */
export const rocketsAuthRecoveryUpdatePasswordSchema = withOpenApi(
  recoveryUpdatePasswordSchema,
  'RecoveryUpdatePasswordDto',
);
