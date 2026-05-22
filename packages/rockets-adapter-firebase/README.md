# @bitwild/rockets-adapter-firebase

Firebase Authentication adapter for the Rockets SDK. Implements
`AuthAdapterInterface` from `@bitwild/rockets-core` so apps can use
Firebase as the source of truth for identity while keeping the rest of
the Rockets pipeline (CRUD, ACL, hooks, context overlay) untouched.

## When to use

- Frontend already signs users in with Firebase (web SDK, mobile, etc.).
- You want a Rockets NestJS backend to trust Firebase ID tokens instead
  of running its own login / token issuance.
- You do NOT need the full `@bitwild/rockets-server-auth` package
  (signup / recovery / OTP / refresh). The adapter only handles the
  "verify the bearer token" half — issuance stays with Firebase.

If you want Rockets to own the entire auth lifecycle, use
`@bitwild/rockets-server-auth` instead.

## Install

```bash
yarn add @bitwild/rockets-adapter-firebase firebase-admin
```

`firebase-admin` is an **optional peer dependency**. The adapter never
imports it at compile time — the SDK lives behind a small structural
interface so consumers can swap in any verifier (mocks in tests,
multi-project routers, etc).

## Quick start

```ts
import * as admin from 'firebase-admin';
import { Module } from '@nestjs/common';
import { RocketsCoreModule } from '@bitwild/rockets-core';
import {
  FirebaseAuthModule,
  FirebaseAuthAdapter,
} from '@bitwild/rockets-adapter-firebase';

const firebaseApp = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

@Module({
  imports: [
    FirebaseAuthModule.forRoot({ firebaseApp }),
    RocketsCoreModule.forRootAsync({
      inject: [FirebaseAuthAdapter],
      useFactory: (authProvider: FirebaseAuthAdapter) => ({
        authProvider,
        repository: TypeOrmRepositoryModule,
        resources: [/* … */],
      }),
    }),
  ],
})
export class AppModule {}
```

If you need async composition, use `forRootAsync()`:

```ts
FirebaseAuthModule.forRootAsync({
  useFactory: async () => ({
    firebaseApp: admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    }),
  }),
});
```

## Customizing user resolution

The default `DefaultFirebaseUserResolverService` returns the Firebase
token claims directly. Provide a custom resolver when you need to look
up local roles, tenants, or feature flags:

```ts
@Injectable()
class AppFirebaseUserResolver implements FirebaseUserResolverInterface {
  constructor(private readonly users: UserRoleLookup) {}

  async resolve(token: FirebaseDecodedTokenInterface): Promise<AuthorizedUser> {
    const roles = await this.users.lookupRoles(token.uid);
    return {
      id: token.uid,
      sub: token.uid,
      email: token.email,
      userRoles: roles.map((name) => ({ role: { name } })),
      claims: { ...token },
    };
  }
}

FirebaseAuthModule.forRoot({
  firebaseApp,
  userResolver: AppFirebaseUserResolver,
});
```

## Failure mapping

Every failure mode surfaces as HTTP 401 with a specific subclass so
ops can filter logs and policies can branch:

| Cause                              | Exception                              |
| ---------------------------------- | -------------------------------------- |
| Empty / null token                 | `FirebaseTokenInvalidException`        |
| Verifier throws `auth/*` error     | `FirebaseTokenInvalidException`        |
| `auth/id-token-revoked` error      | `FirebaseTokenRevokedException`        |
| Decoded token missing `uid`        | `FirebaseTokenMissingSubjectException` |
| Custom resolver throws non-auth    | `FirebaseAuthException` (wrapped)      |

## Token revocation

Pass `checkRevoked: true` to opt into Firebase's revocation check on
every request. This adds a network round-trip to Google — use sparingly
(admin endpoints, money flows). Most apps leave it `false` and rely on
short token TTLs.

```ts
FirebaseAuthModule.forRoot({
  firebaseApp,
  checkRevoked: true,
});
```
