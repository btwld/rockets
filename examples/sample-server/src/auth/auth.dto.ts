import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from './user.entity';

function namedZodDto<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  name: string,
) {
  const dto = createZodDto(schema);
  Object.defineProperty(dto, 'name', { value: name });
  return dto;
}

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  name: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export type SignupBody = z.infer<typeof signupSchema>;
export const SignupDto = namedZodDto(signupSchema, 'SignupDto');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginSchema>;
export const LoginDto = namedZodDto(loginSchema, 'LoginDto');
