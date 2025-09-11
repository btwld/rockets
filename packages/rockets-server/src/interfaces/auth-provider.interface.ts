import { AuthorizedUser } from './auth-user.interface';

export interface AuthProviderInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}