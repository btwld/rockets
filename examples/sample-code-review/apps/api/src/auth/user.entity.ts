import { z } from 'zod';
import { createdEntity, f } from '@bitwild/rockets-zod';
import { zodEntityCompiler } from '../zod-bindings';

/**
 * Local user row keyed by Firebase `uid` (see resolver / metadata `userId`).
 * No password flow — identity comes from Firebase tokens. Zod-sourced.
 */
export const userSchema = createdEntity({
  email: f.string({ max: 255, unique: true, example: 'dev@example.com' }),
  name: f.string({ max: 100 }).optional(),
});

export type User = z.infer<typeof userSchema>;

export const UserEntity = zodEntityCompiler.compileEntity(userSchema, {
  name: 'UserEntity',
  table: 'users',
});
