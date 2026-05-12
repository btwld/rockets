import { AuthorizedUser } from './auth-user.interface';

export interface AuthAdapterInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}

export interface AuthorizeUserInterface {
  authorize(
    user: AuthorizedUser,
    resource: string,
    action: string,
  ): Promise<boolean>;
}

export interface ValidateTokenInterface {
  validate(token: string): Promise<AuthorizedUser | null>;
}
