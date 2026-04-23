<!-- markdownlint-disable MD013 -->
# HTTP endpoint matrix — `@bitwild/rockets-auth` (e2e regression)

Living checklist: **METHOD path** × **primary e2e file** × **notes**. Update when controllers or specs change.

## Controllers registered by `createRocketsAuthControllers` + CRUD submodules

| Group | METHOD | Path (global prefix) | Covered in (e2e) | Typical cases |
|------|--------|----------------------|------------------|---------------|
| Password login | POST | `/token/password` | `rockets-auth.e2e-spec.ts` | 200, 401, JWT protected route |
| Refresh | POST | `/token/refresh` | `rockets-auth.e2e-spec.ts` | 200, invalid token |
| Recovery | POST | `/recovery/login` | `rockets-auth.e2e-spec.ts` | 201, 400 body |
| Recovery | POST | `/recovery/password` | `rockets-auth.e2e-spec.ts` | 201, 400 |
| Recovery | GET | `/recovery/passcode/:passcode` | `rockets-auth.e2e-spec.ts` | 200/400 |
| Recovery | PATCH | `/recovery/password` | `rockets-auth.e2e-spec.ts` | 400 variants |
| OTP | POST | `/otp` | `rockets-auth-otp-me-password.e2e-spec.ts` | 201, 400 email |
| OTP | PATCH | `/otp` | `rockets-auth-otp-me-password.e2e-spec.ts` | 200 tokens, 401 bad code |
| Me password | PATCH | `/me/password` | `rockets-auth-otp-me-password.e2e-spec.ts` | 200 happy path, 401 no JWT; wrong-current 401 when `user.settings.password.requireCurrent` (not enabled in default e2e factory) |
| OAuth | GET | `/oauth/authorize` | `auth-oauth.controller.e2e-spec.ts` | per provider |
| OAuth | GET/POST | `/oauth/callback` | `auth-oauth.controller.e2e-spec.ts` | |
| Signup CRUD | POST | `/signup` (default) | `rockets-auth.e2e-spec.ts`, `rockets-auth-signup.module.e2e-spec.ts` | 201, 400 |
| Admin users | * | `/admin/users`… | `rockets-auth-admin*.e2e-spec.ts` | CRUD variants |
| Admin roles | * | `/admin/roles`… | `rockets-auth-admin*.e2e-spec.ts`, role admin module specs | |
| Invitations | POST | `/admin/invitations` | `invitation-flow.e2e-spec.ts` | |
| Invitations | POST | `/admin/invitations/revoke` | `invitation-flow.e2e-spec.ts` | |
| Invitations | POST | `/admin/invitations/:code/reattempt` | `invitation-flow.e2e-spec.ts` | |
| Acceptance | PATCH | `/invitation-acceptance/:code` | `invitation-flow.e2e-spec.ts` | |
| Admin user roles | GET, POST | `/admin/users/:userId/roles` | `admin-user-roles.controller.e2e-spec.ts` | |

## `disableController` spot checks

| Flag | Asserted in | Expected |
|------|-------------|----------|
| `password` | `rockets-auth-disable-controller.e2e-spec.ts` | `POST /token/password` → 404 |
| `otp` | `rockets-auth-disable-controller.e2e-spec.ts` | `POST /otp` → 404 |
| `mePassword` | `rockets-auth-disable-controller.e2e-spec.ts` | `PATCH /me/password` → 404 |

## Out of scope for this package matrix

Consumer apps under `examples/`, and `packages/rockets-server` routes such as `GET/PATCH /me` (user metadata) are not listed here.

## Skipped / legacy

- `rockets-server-auth-sqllite.e2e-spec.ts` is `describe.skip`; matrix treats it as **not** CI-active.

## Jest e2e harness (`jest.config-e2e.json`)

- **`@concepta/nestjs-invitation`**: the previous moduleNameMapper stub had an empty `InvitationService` and broke `invitation-flow.e2e-spec.ts` with 500s; e2e now resolves the **real** package (same as runtime).
- **`testTimeout`**: 60s; **`maxWorkers`**: 2 — reduces flaky timeouts when several Nest apps boot in parallel.
