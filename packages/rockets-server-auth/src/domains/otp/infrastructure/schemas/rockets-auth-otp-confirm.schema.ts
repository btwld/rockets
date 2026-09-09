import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/** `PATCH /otp` body. */
export const rocketsAuthOtpConfirmSchema = withOpenApi(
  z.object({
    email: z.email().meta({
      description: 'Email associated with the OTP',
      example: 'user@example.com',
    }),
    passcode: z.string().min(1).meta({
      description: 'OTP passcode to verify',
      example: '123456',
    }),
  }),
  'RocketsAuthOtpConfirmDto',
);
