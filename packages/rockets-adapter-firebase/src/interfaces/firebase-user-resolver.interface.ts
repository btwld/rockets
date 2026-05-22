import { AuthorizedUser } from '@bitwild/rockets-core';

import { FirebaseDecodedTokenInterface } from './firebase-decoded-token.interface';

/**
 * Maps a verified Firebase token into the Rockets `AuthorizedUser`
 * shape. The default implementation
 * (`DefaultFirebaseUserResolverService`) returns claims directly from
 * the token. Applications that need to enrich the user (look up roles
 * from a local table, attach tenant info, etc.) provide their own
 * resolver via the `userResolver` option.
 */
export interface FirebaseUserResolverInterface {
  resolve(token: FirebaseDecodedTokenInterface): Promise<AuthorizedUser>;
}
