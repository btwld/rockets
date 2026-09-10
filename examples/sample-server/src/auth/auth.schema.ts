import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';
import { UserRole } from './user.entity';

/**
 * Request/response schemas for the hand-written auth controller. Each one
 * is wrapped LAST with `withOpenApi(schema, id)` so the per-route
 * `StandardSchemaValidationPipe` validates the body and Swagger emits the
 * named component (`$ref`) — no DTO classes.
 */
export const signupSchema = withOpenApi(
  z.object({
    email: z.email(),
    password: z.string().min(1),
    name: z.string().min(1).optional(),
    role: z.enum(UserRole).optional(),
  }),
  'SignupDto',
);
export type SignupBody = z.output<typeof signupSchema>;

export const loginSchema = withOpenApi(
  z.object({
    email: z.email(),
    password: z.string().min(1),
  }),
  'LoginDto',
);
export type LoginBody = z.output<typeof loginSchema>;

export const signupResponseSchema = withOpenApi(
  z.object({
    id: z.string().meta({ description: 'Generated UUID for the new account' }),
    email: z.string().meta({ example: 'user@example.com' }),
    // Nullable column: a signup without `name` reads back as `null`.
    name: z.string().meta({ example: 'John Doe' }).nullable().optional(),
    role: z.enum(UserRole).meta({ example: UserRole.USER }),
    accessToken: z
      .string()
      .meta({ description: 'Signed JWT — pass as Bearer token' }),
  }),
  'SignupResponseDto',
);
export type SignupResponse = z.output<typeof signupResponseSchema>;

export const loginResponseSchema = withOpenApi(
  z.object({
    accessToken: z
      .string()
      .meta({ description: 'Signed JWT — pass as Bearer token' }),
  }),
  'LoginResponseDto',
);
export type LoginResponse = z.output<typeof loginResponseSchema>;
