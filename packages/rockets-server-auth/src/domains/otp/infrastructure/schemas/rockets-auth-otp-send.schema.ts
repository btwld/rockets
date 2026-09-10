import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/** `POST /otp` body. */
export const rocketsAuthOtpSendSchema = withOpenApi(
  z.object({
    email: z.email().meta({
      description: 'Email to send OTP to',
      example: 'user@example.com',
    }),
  }),
  'RocketsAuthOtpSendDto',
);
