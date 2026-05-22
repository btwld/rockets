import { Injectable } from '@nestjs/common';

import { AuthorizedUser } from '@bitwild/rockets-core';

import { FirebaseDecodedTokenInterface } from '../interfaces/firebase-decoded-token.interface';
import { FirebaseUserResolverInterface } from '../interfaces/firebase-user-resolver.interface';

/**
 * Default resolver — builds an `AuthorizedUser` straight from token
 * claims with no database lookup. Override with `userResolver` when
 * you need to enrich the user (roles from a local table, etc).
 *
 * - `id` / `sub` map to the Firebase `uid`.
 * - `email` is included only when the token carries one.
 * - `userRoles` is hydrated from the standard `roles: string[]` custom
 *   claim. Tokens without that claim get an empty `userRoles` array.
 */
@Injectable()
export class DefaultFirebaseUserResolverService
  implements FirebaseUserResolverInterface
{
  async resolve(token: FirebaseDecodedTokenInterface): Promise<AuthorizedUser> {
    const roles = extractRoles(token);

    const user: AuthorizedUser = {
      id: token.uid,
      sub: token.uid,
      userRoles: roles.map((name) => ({ role: { name } })),
      claims: { ...token },
    };

    if (typeof token.email === 'string') {
      user.email = token.email;
    }

    return user;
  }
}

function extractRoles(token: FirebaseDecodedTokenInterface): string[] {
  const raw = token['roles'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((r): r is string => typeof r === 'string');
}
