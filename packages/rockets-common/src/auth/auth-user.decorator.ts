import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Param decorator that resolves the authenticated user from the request.
 *
 * The user is read from `request.user`, the conventional field populated by
 * the authentication guard. Pass a property name to extract a single field.
 *
 * @example
 * ```ts
 * findOne(@AuthUser() user: UserInterface) {}
 * findOne(@AuthUser('id') userId: string) {}
 * ```
 */
export const AuthUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
