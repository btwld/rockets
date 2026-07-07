import { z } from 'zod';
import { createdEntity, f } from '@bitwild/rockets-core/zod';
import { compileZodEntity } from '../zod-bindings';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

/**
 * Local user row for the sample auth adapter. Zod-sourced — the adapter
 * (`auth.adapter.ts`) and the pet-transfer / events handlers inject
 * `UserEntity` (value) and type rows by `UserEntity` (the same-named row
 * type below).
 */
export const userSchema = createdEntity({
  email: f.string({ max: 255, unique: true, example: 'dev@example.com' }),
  password: f.string({ max: 255 }),
  name: f.string({ max: 100 }).optional(),
  role: f.enum(UserRole, { default: UserRole.USER, length: 20 }),
});

export const UserEntity = compileZodEntity(userSchema, {
  name: 'UserEntity',
  table: 'users',
});
/** Row type — shares the name with the entity value for type-position uses. */
export type UserEntity = z.output<typeof userSchema>;
