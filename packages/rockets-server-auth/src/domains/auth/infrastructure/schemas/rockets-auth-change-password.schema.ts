import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/** `PATCH /me/password` body. */
export const rocketsAuthChangePasswordSchema = withOpenApi(
  z.object({
    currentPassword: z.string().min(1).meta({
      title: 'Current Password',
      description: 'The user current password for verification',
      example: 'CurrentP@ssw0rd',
    }),
    newPassword: z.string().min(8).meta({
      title: 'New Password',
      description: 'The new password to set (minimum 8 characters)',
      example: 'NewSecureP@ssw0rd',
    }),
  }),
  'RocketsAuthChangePasswordDto',
);
