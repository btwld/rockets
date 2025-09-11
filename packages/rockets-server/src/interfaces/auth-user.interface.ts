export interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  roles?: string[];
  claims?: Record<string, unknown>;
}


