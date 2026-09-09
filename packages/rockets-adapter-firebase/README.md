# @concepta/rockets-adapter-firebase

[![NPM](https://img.shields.io/npm/v/@concepta/rockets-adapter-firebase)](https://www.npmjs.com/package/@concepta/rockets-adapter-firebase)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Firebase Authentication adapter for Rockets. Validates Firebase ID tokens,
> maps the decoded payload to `AuthorizedUser`, and plugs into the standard
> `auth` chain.

**Status:** pre-1.0 preview. The package manifest is set to `1.0.0-alpha.8`, but
registry publication is pending; install commands below apply after the
`alpha` dist-tag is updated. Public shapes may still change before 1.0.

---

## 1. Introduction

`@concepta/rockets-adapter-firebase` is a self-contained Nest module that
implements `AuthAdapterInterface` from `@concepta/rockets-core`. It owns:

- `FirebaseAuthAdapter` — extracts the bearer token, verifies it with the
  Firebase Admin SDK, and returns a Rockets `AuthorizedUser`.
- `FirebaseAuthModule.forRoot()` / `.forRootAsync()` — the Nest module that
  wires the adapter with its verifier, user resolver, and options.
- `DefaultFirebaseUserResolverService` — the default mapper from Firebase
  decoded token → `AuthorizedUser` (uses `uid`, `email`, and custom `roles[]`
  claim).
- Typed verification primitives (`FirebaseTokenVerifierInterface`) so tests
  inject mocks and apps can swap the SDK.

The adapter has **no firebase-admin compile-time dependency**. `firebase-admin`
is an optional peer dep; the package types model only the subset of
`DecodedIdToken` Rockets reads.

### When to use this package

- Your users sign in through Firebase (Google, Apple, email/password, phone,
  custom auth providers) and your backend needs to validate Firebase ID tokens.
- You want to mix Firebase with another credential (API key, JWT) — pair it in
  the `auth` chain.

### When NOT to use this package

- You authenticate against a non-Firebase provider — write your own
  `AuthAdapterInterface`, or pick a different adapter.
- You don't need to verify tokens server-side (pure client-side auth) — you
  don't need any adapter at all.

---

## 2. Get Started

### Install

```bash
yarn add @concepta/rockets-adapter-firebase@alpha firebase-admin
```

`firebase-admin` is an optional peer dependency — required when you let the
module wrap the SDK (the common case).

### Wire it into a Rockets app

Use the `defineFirebaseAuth()` helper. It returns an `AuthBootstrap` that
`createServer({ auth })` or `RocketsModule.forRoot({ auth })` consumes
directly. Core imports `FirebaseAuthModule` and injects
`FirebaseAuthAdapter` from that module — the adapter is not double-registered.

```typescript
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { defineFirebaseAuth } from '@concepta/rockets-adapter-firebase';
import { RocketsModule } from '@concepta/rockets';
import { defineModuleResource } from '@concepta/rockets-core';

import { UserEntity } from './auth/user.entity';

const firebaseApp = initializeApp({ credential: applicationDefault() });

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: defineFirebaseAuth({
        firebaseApp,
      }),
      userMetadata: {
        /* entity, updateSchema, responseSchema — from defineUserMetadata(schema) */
      },
      repository,
      resources: [defineModuleResource({ entities: [UserEntity] })],
    }),
  ],
})
export class AppModule {}
```

Pass `{ forRootAsync: ... }` instead of flat sync options to build options
asynchronously (e.g. inject `ConfigService`). See
[How-to › Build options asynchronously](#build-options-asynchronously).

---

## 3. How-to Guides

### Verify with a custom verifier (e.g. tests, multi-project router)

Supply `verifier: Type<FirebaseTokenVerifierInterface>` instead of
`firebaseApp`. The module instantiates it via `ModuleRef`, so it can inject
dependencies normally.

```typescript
@Injectable()
class FakeVerifier implements FirebaseTokenVerifierInterface {
  async verifyIdToken(token: string) {
    return { uid: 'user-1', sub: 'user-1', email: 'u@example.com' };
  }
}

FirebaseAuthModule.forRoot({ verifier: FakeVerifier });
```

When both `firebaseApp` and `verifier` are passed, the custom verifier wins.

### Enrich the user with local data (roles from your DB, tenant, etc.)

Implement `FirebaseUserResolverInterface` and pass it as `userResolver`. The
default resolver only reads claims directly from the token.

```typescript
@Injectable()
class MyUserResolver implements FirebaseUserResolverInterface {
  constructor(private readonly users: UserService) {}

  async resolve(token: FirebaseDecodedTokenInterface): Promise<AuthorizedUser> {
    const local = await this.users.byFirebaseUid(token.uid);
    return {
      id: local.id,
      sub: token.uid,
      email: token.email,
      userRoles: local.roles.map((name) => ({ role: { name } })),
      claims: { ...token, tenantId: local.tenantId },
    };
  }
}

FirebaseAuthModule.forRoot({ firebaseApp, userResolver: MyUserResolver });
```

### Reject revoked tokens

`checkRevoked: false` is the default. Enable it for high-security flows — adds a
Firebase round-trip per request.

```typescript
FirebaseAuthModule.forRoot({ firebaseApp, checkRevoked: true });
```

A revoked token surfaces as `FirebaseTokenRevokedException`, mapped by the
adapter into `AuthAttemptResult: { matched: true, error }`.

### Build options asynchronously

`forRootAsync` accepts the standard Nest async shapes:

```typescript
FirebaseAuthModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (cfg: ConfigService) => ({
    firebaseApp: await buildFirebaseApp(cfg),
    checkRevoked: cfg.get('FIREBASE_CHECK_REVOKED') === 'true',
  }),
});
```

`useClass` and `useExisting` are also supported via a
`FirebaseAuthModuleOptionsFactory` implementation.

### Session-cookie auth + CSRF (browser sessions, issue #58)

For a browser session held as a cookie instead of a re-sent bearer
token, use `FirebaseSessionCookieAdapter` alongside (not instead of)
`FirebaseAuthAdapter` — each matches only the credential it owns:

```typescript
import {
  FirebaseAuthAdapter,
  FirebaseSessionCookieAdapter,
} from '@concepta/rockets-adapter-firebase';
import { defineAuthAdapter } from '@concepta/rockets-core';

FirebaseAuthModule.forRoot({
  firebaseApp,
  sessionCookie: {
    cookieName: '__session', // omit `sessionCookie` to skip session auth entirely
    // checkRevoked defaults to TRUE for session cookies — see below.
  },
});

RocketsModule.forRoot({
  auth: [
    defineAuthAdapter(FirebaseAuthAdapter),
    defineAuthAdapter(FirebaseSessionCookieAdapter),
  ],
});
```

Mint the cookie once, right after the client verifies its ID token:

```typescript
@Inject(FIREBASE_TOKEN_VERIFIER_TOKEN)
private readonly verifier: FirebaseSessionCookieVerifierInterface;

const cookie = await this.verifier.createSessionCookie(idToken, {
  expiresIn: 14 * 24 * 60 * 60 * 1000, // Firebase caps this at 14 days
});
// set `cookie` as an httpOnly, Secure cookie on the response
```

`FirebaseSessionCookieAdapter` is ALWAYS registered as a provider, same
as `FirebaseAuthAdapter` — a bearer-only app that never adds it to its
own `auth` array sees no behavior change. State-changing requests to a
session route still need CSRF protection: pair this with `@AuthSession()`
and `CsrfGuard` from `@concepta/rockets-core` — full pattern in
[CONFIGURATION.md §7c](../../CONFIGURATION.md#7c-session-cookie-auth-csrf-and-the-ternary-route-policy-issue-58).

**`sessionCookie.checkRevoked` defaults to `true`**, the opposite of the
bearer `checkRevoked` (`false`). Different credentials, different blast
radii: an ID token expires in an hour, but the session cookie above
lives for 14 days, and skipping the revocation lookup — the same check
that catches a DISABLED user — means signing out all devices, disabling
the account, or rotating credentials after a breach does nothing to an
attacker holding the cookie for two weeks. Each verified request costs
a Firebase round-trip; set `checkRevoked: false` only with a deliberate
reason, such as a short `expiresIn` or revocation enforced elsewhere.

### Read the user inside a handler

The adapter writes the `AuthorizedUser` onto the request the same way every
Rockets adapter does. Use `@AuthUser()` from `@concepta/rockets-core` in
controllers, or `getActor(context)` from `@concepta/rockets-core` inside CRUD
command/query handlers.

```typescript
import { AuthUser } from '@concepta/rockets-core';
import type { AuthorizedUser } from '@concepta/rockets-core';

@Controller('profile')
export class ProfileController {
  @Get()
  me(@AuthUser() user: AuthorizedUser) {
    return user;
  }
}
```

---

## 4. Reference

### Integration helper

| Member | Purpose |
|---|---|
| `defineFirebaseAuth(input)` | Returns an `AuthBootstrap` for `createServer({ auth })` or `RocketsModule.forRoot({ auth })`. Pass module options directly for sync wiring, or `{ forRootAsync }` for async wiring. |
| `DefineFirebaseAuthInput` | Input type for either flat sync options or the explicit `{ forRootAsync }` variant. |

### Module

| Member | Purpose |
|---|---|
| `FirebaseAuthModule.forRoot(options)` | Sync registration. Returns a global dynamic module that provides `FirebaseAuthAdapter`. Use directly if you need to import the module outside the `defineFirebaseAuth()` flow. |
| `FirebaseAuthModule.forRootAsync(options)` | Async variant accepting `useFactory` / `useClass` / `useExisting`. |

### Adapter

| Symbol | Purpose |
|---|---|
| `FirebaseAuthAdapter` | Implements `AuthAdapterInterface`. Returns `{ matched: false }` for non-Bearer requests; otherwise verifies and resolves the user. |
| `FirebaseSessionCookieAdapter` | Implements `AuthAdapterInterface` over a session cookie instead of a bearer header (issue #58). Returns `{ matched: false }` when the configured cookie is absent. Always registered as a provider — an app opts in by adding it to its own `auth` chain. |

### Options

| Field | Type | Required | Purpose |
|---|---|---|---|
| `firebaseApp` | `unknown` (`admin.app.App`) | yes (unless `verifier` is set) | An initialised `firebase-admin` app. Typed loosely so the package does not pin a `firebase-admin` major version. |
| `verifier` | `Type<FirebaseTokenVerifierInterface>` | optional | Custom verifier class — takes precedence over `firebaseApp`. |
| `userResolver` | `Type<FirebaseUserResolverInterface>` | optional | Custom resolver. Default uses claims from the token only. |
| `checkRevoked` | `boolean` (default `false`) | optional | Ask Firebase whether the token was revoked on every request. |
| `imports` | `ModuleMetadata['imports']` | optional | Imports the module pulls in (typical use: a `ConfigModule`). |
| `sessionCookie` | `FirebaseSessionCookieConfig` | optional | Opts into session-cookie auth (issue #58): `cookieName` (default `'__session'`) and `checkRevoked` (default **`true`** — unlike the bearer `checkRevoked`, because a session cookie lives up to 14 days). Omit to leave `FirebaseSessionCookieAdapter` unused (still registered as a provider — harmless if never added to `auth`). |

### Interfaces

| Type | Purpose |
|---|---|
| `FirebaseTokenVerifierInterface` | Contract for token verifiers. `verifyIdToken(token, options?)`. |
| `FirebaseVerifyOptions` | `{ checkRevoked?: boolean }` passed to the verifier. |
| `FirebaseSessionCookieVerifierInterface` | Session-cookie capability (issue #58) — a SEPARATE interface from the bearer one, so a bearer-only custom `verifier` is not forced to implement it. `verifySessionCookie(cookie, options?)`, `createSessionCookie(idToken, { expiresIn })`. |
| `FirebaseSessionCookieOptions` | `{ expiresIn: number }` (ms) passed to `createSessionCookie`. |
| `FirebaseSessionCookieConfig` | `{ cookieName?: string }` module option — defaults to `'__session'`. |
| `FirebaseUserResolverInterface` | Contract for user resolvers. `resolve(decoded) → AuthorizedUser`. |
| `FirebaseDecodedTokenInterface` | Minimal shape of a verified Firebase token (`uid`, `sub`, `email?`, `email_verified?`, `name?`, custom claims). |
| `FirebaseAuthModuleOptions` | Options shape for `forRoot`. |
| `FirebaseAuthModuleAsyncOptions` | Options shape for `forRootAsync`. |
| `FirebaseAuthModuleOptionsFactory` | Class form for `useClass` / `useExisting`. |

### Services

| Class | Purpose |
|---|---|
| `FirebaseTokenVerifierService` | Default verifier that wraps `admin.auth()`. Implements BOTH `FirebaseTokenVerifierInterface` and `FirebaseSessionCookieVerifierInterface`. Constructor takes the firebase-admin app. |
| `DefaultFirebaseUserResolverService` | Default resolver. Reads `uid`, `email`, `roles[]` custom claim. |

### Exceptions

| Class | When |
|---|---|
| `FirebaseAuthException` | Thrown when the user resolver fails. Wraps the original error. |
| `FirebaseTokenInvalidException` | Bad signature, expired, wrong audience, empty token. |
| `FirebaseTokenRevokedException` | `auth/id-token-revoked` returned by the SDK with `checkRevoked: true`. |
| `FirebaseTokenMissingSubjectException` | Verified token has no `uid` claim. |
| `FirebaseSessionCookieInvalidException` | Session-cookie counterpart of `FirebaseTokenInvalidException` (issue #58). |
| `FirebaseSessionCookieRevokedException` | `auth/session-cookie-revoked` **or** `auth/user-disabled` — both come from the revocation lookup, which `sessionCookie.checkRevoked` runs by default. |

### Tokens

| Token | Purpose |
|---|---|
| `FIREBASE_AUTH_MODULE_OPTIONS_TOKEN` | Override the options provider in advanced wiring. |
| `FIREBASE_TOKEN_VERIFIER_TOKEN` | Replace the verifier in tests or for token caching. |
| `FIREBASE_SESSION_COOKIE_VERIFIER_TOKEN` | Resolves the SAME instance as `FIREBASE_TOKEN_VERIFIER_TOKEN`, typed for the session-cookie capability (issue #58). |
| `FIREBASE_USER_RESOLVER_TOKEN` | Replace the user resolver. |

### Failure mapping

| Cause | Adapter result |
|---|---|
| Empty / null bearer token | `{ matched: false }` |
| Verifier throws | `{ matched: true, error: FirebaseTokenInvalidException }` |
| `auth/id-token-revoked` | `{ matched: true, error: FirebaseTokenRevokedException }` |
| Token has no `uid` | `{ matched: true, error: FirebaseTokenMissingSubjectException }` |
| User resolver throws | `{ matched: true, error: FirebaseAuthException }` |
| No session cookie on the request | `{ matched: false }` |
| `auth/session-cookie-revoked` or `auth/user-disabled` | `{ matched: true, error: FirebaseSessionCookieRevokedException }` |
| Any other session-cookie verify failure | `{ matched: true, error: FirebaseSessionCookieInvalidException }` |

Note the availability trade-off `checkRevoked: true` brings: every
verified session request calls Firebase, so a Firebase Auth outage or a
quota error surfaces as `FirebaseSessionCookieInvalidException` — a
`401` indistinguishable from a genuinely bad cookie, and effectively a
forced logout for all cookie-authenticated users until it recovers. It
fails CLOSED, which is the right direction for a credential check, but
size your quota and alerting accordingly.

---

## License

BSD-3-Clause
