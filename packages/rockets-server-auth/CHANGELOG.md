# Changelog

All notable changes to the `@concepta/rockets-auth` package will be
documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **A consumer-supplied `userCrud.model` / `roleCrud.model` is checked like
  every other response schema.** The signup and admin CRUD modules hand the
  model straight to upstream CRUD serialization (no `defineResource`
  projection), so it only had its component name verified; it now also has
  to strip undeclared keys (`assertFailClosedResponse`) and carry no
  `dto: { response: false }` field (`assertNoHiddenFields`) — a hidden
  column in an overridden model would have shipped on `POST /signup`,
  `/admin/users` and `/admin/roles`. Rejected at boot with a pointer at
  `.omit()`.
- **User-metadata updates pin `userId` from the caller.** The update branch
  of the metadata repository used to write the validated payload as-is, so
  an app-supplied update schema that admits `userId` could move a row to
  another user. Ownership now comes from the caller on both the create and
  the update branch, whatever the schema admits.
- Invitation acceptance validates `payload.userMetadata` with the same
  default as signup and admin: when the app configures no
  `userCrud.userMetadataConfig`, the base update schema (`{}`) strips every
  client-supplied key. Previously the metadata record was forwarded
  unvalidated on that path, and a smuggled `userId` could rewrite the
  metadata row's owner on the update branch. The listener no longer has an
  unvalidated branch (`InvitationAcceptanceConfig.userMetadataUpdateSchema`
  is required).

- OTP consume is the single decision point for burning passcodes:
  `RocketsValidateOtpHandler` dispatches `ConsumeOtpCommand` when
  `deleteIfValid` is true (no prior `ValidateOtpQuery`), and recovery
  `updatePassword` consumes before mutating the password, inside ONE
  transaction scope with the password write and the sibling-OTP cleanup —
  a failed write rolls the consume back with it (RFC #104, stage 4: the
  scope must be the outermost one, because once an inner outermost scope
  commits, the request context keeps the finished transaction and every
  later repository call on it fails). DB-level single-winner under
  concurrent consumes still needs upstream nestjs-otp locking; this closes
  the application validate-then-consume TOCTOU only. New e2e:
  `domains/otp/__tests__/otp-login.e2e-spec.ts` (send → confirm → tokens →
  passcode burned).

### Release preparation

- Package manifest set to `1.0.0-alpha.8`; registry publication is
  pending.

### Breaking

- Authentication is now fail-closed on `active`: a user authenticates only when
  `active === true`. Deactivated users are rejected on both access and refresh
  tokens, and any persisted row with `active` unset/null (or an admin-created
  user without an explicit `active`) is treated as inactive. **Backfill legacy
  user rows to `active: true` before deploying.** Built-in signup and
  admin-create default new users to `active: true`; pass `active: false`
  explicitly to create an inactive user.

- Hosts must stop passing `buildRocketsAuthResources(...)` on
  `RocketsModule.forRoot({ resources })`. `defineRocketsAuth()` now contributes
  those rows itself, and the planner rejects an entity class registered twice —
  keeping the explicit spread fails at boot with
  ``entity `<Name>` registered twice``. Leave `resources` for the host's own
  bundles; `repository` and `userMetadata` may also be dropped, since explicit
  options still take precedence when supplied.

### Added

- Complete public account-recovery HTTP flow: enumeration-safe initiation,
  passcode validation, and OTP-authorized password rotation.
- Default global throttling with stricter login and recovery limits; hosts can
  configure it or explicitly opt out.
- End-to-end regression coverage for duplicate CQRS ownership, recovery,
  password reuse policy, and login throttling.

### Changed

- **The `@nestjs/config` devDependency is gone.** Nothing in the package
  injects `ConfigService`; the only reference was an e2e mock module no
  test consumed — dead since the RFC #104 stage that removed the runtime
  dependency. Found by the realtystack consumer run (its runtime is CJS
  and `@nestjs/config@12` is ESM-only, which is what prompted the audit).
- **One deliberate behavioural DIVERGENCE from `@nestjs/throttler`:**
  every dimension counts every attempt. Throttler's guard threw on the
  first exceeded throttler and never incremented the rest, so an attacker
  who saturated the coarse per-IP ceiling kept the fine
  per-`(ip, account)` counters clean. Core's guard consumes all
  dimensions before deciding. Everything else below is preserved.
- **Auth throttling runs on core's rate-limit port; `@nestjs/throttler`
  is gone.** The latest throttler (6.5.0) caps peers at Nest 11, which
  made `npm install @concepta/rockets-auth` unresolvable on default npm.
  Behaviour is preserved: per-IP ceiling (1000/min) that no route
  overrides plus per-`(ip, account)` fine limits per route, `trust proxy`
  respected, `throttling: false` still disables. **Breaking**:
  `extras.throttling` is now `false | { ip?: { limit, windowMs },
  default?: { limit, windowMs }, store? }` — the old
  `@nestjs/throttler`-shaped pass-through (arrays, `ttl`, `getTracker`,
  `storage`) is no longer accepted; a custom counter store implements
  core's `RateLimitStoreInterface` and is passed as `throttling.store`.

- **`ConceptaRepositoryCompatModule` removed.** It was a self-declared
  no-op still imported and registered by the module definition;
  `RepositoryModule.forRoot(...)` already provides `TransactionScope`
  globally.
- **Auth handlers resolve the app context through upstream
  `AppContextHost.from()`.** The local `resolveConceptadevAppContext`
  helper minted a fresh host for any non-host value and discarded what
  the caller passed, which could drop a live transaction context inside
  the password, OTP and user handlers. `AppContextHost.from()` throws on
  a non-empty non-host value.

- **Hand-written auth request bodies keep their OpenAPI component names.**
  `POST /token/password`, `POST /token/refresh` and the four `/recovery`
  bodies are documented as `LocalLoginDto`, `RefreshDto` and
  `Recovery*Dto` again (upstream ships those schemas without an id, which
  inlined them into every route after the schema-engine change).
- **Migration — renamed and removed OpenAPI components (RFC #104).**
  Generated clients pick up new type names: `AuthenticationResponseDto` →
  `AuthenticationResponse` (upstream's id); the user and role resources are
  `RocketsAuthUserDto` / `RocketsAuthRoleDto` (were `UserDto` / `RoleDto`);
  the admin list envelopes are `AdminUsersPaginatedDto` /
  `AdminRolesPaginatedDto` and every other list envelope is
  `<Resource>PaginatedDto` (the shared `CrudResponsePaginatedDto` is gone);
  `CrudInvalidResponseDto` is gone — validation errors are the Rockets
  error envelope with `details[]`. Generated CRUD request bodies keep their
  ids (`UserCreateDto`, `RoleCreateDto`, …). Regenerate the client and
  rename the imports; no wire field changed shape.
- **Last class DTOs retired (RFC #104, stage 6).** `RocketsAuthChangePasswordDto`
  → `rocketsAuthChangePasswordSchema`, `RocketsAuthOtpSendDto` →
  `rocketsAuthOtpSendSchema`, `RocketsAuthOtpConfirmDto` →
  `rocketsAuthOtpConfirmSchema`, `RocketsAuthInvitationRevokeDto` →
  `rocketsAuthInvitationRevokeSchema`, the inline admin role-assignment body
  → `rocketsAuthAdminAssignUserRoleSchema`; the invitation-acceptance
  `payload` is validated by `rocketsAuthInvitationAcceptancePayloadSchema`
  (was accepted unvalidated). Every hand-written route validates with its
  own Standard Schema pipe; `class-validator` / `class-transformer` are no
  longer peers. They remain plain **dependencies** of this package only
  because `@concepta/nestjs-email` / `nestjs-event` (still `7.0.0-alpha.10`)
  pull `@concepta/nestjs-common@7`, which requires both at import time —
  the packed-consumer check fails without them. Drop them when those two
  modules move to the alpha.9 line.
- **Schemas instead of DTO classes (RFC #104, stage 4; upstream
  `8.0.0-alpha.9`).** The user / role / invitation DTO classes that extended
  upstream classes (`RocketsAuthUserDto`, `RocketsAuthUserCreateDto`,
  `RocketsAuthUserUpdateDto`, `RocketsAuthRoleDto` + create/update,
  `RocketsAuthInvitationDto` + accept/create/response,
  `RocketsAuthUserMetadataDto`) are named zod schemas composed from the
  upstream schemas; the admin user / role CRUD and signup modules pass
  schemas to upstream CRUD with `rocketsSchemaValidation`; the token,
  recovery and invitation controllers validate with `@Body({ schema })` +
  the per-route Standard Schema pipe and document with `standardSchema`.
  `UserCrudOptionsExtrasInterface.model` / `dto.createOne` / `dto.updateOne`
  and the role equivalents are `z.ZodType`; `UserMetadataConfigInterface` is
  `{ entity, updateSchema, responseSchema }`; the invitation-acceptance
  listener validates with `validateWithSchema`. `@concepta/nestjs-common` is
  no longer a dependency (`EmailSendInterface` is package-owned; password
  interfaces come from `@concepta/nestjs-user` / `@concepta/nestjs-authentication`).
- `@nestjs/config` dropped (RFC #104, stage 1). `RocketsAuthModule` registers
  its default settings (roles, e-mail templates, OTP) as a plain provider
  (`ROCKETS_AUTH_SETTINGS_DEFAULTS_TOKEN`) instead of `registerAs` +
  `ConfigModule.forFeature`; `rocketsAuthOptionsDefaultConfig` is now that
  provider object (`{ provide, useFactory }`), not a `registerAs` function.
  `ConfigModule` is no longer re-exported. The package keeps `@nestjs/config`
  only as a devDependency for the e2e `ConfigService` stub.
- Auth `CrudModule` root registration no longer replaces upstream's
  `CrudContextOverlay` with `SafeCrudContextInterceptor` (removed from core);
  uses `CrudModule.forRootAsync` as published.
- Published declarations carry the Express and Passport type dependencies they
  reference, and the public throttling configuration remains usable by strict
  NodeNext consumers on the Nest 12 alpha line.
- `defineRocketsAuth()` now returns a complete composition: auth persistence
  rows, root repository, user-metadata contract, and guard preference travel
  with the integration. Its Rockets guard defaults off because the built-in
  authentication module already owns a JWT global guard; mixed-auth hosts can
  explicitly reverse that ownership.
- CQRS handlers have one owner. Signup and password-validation registrations no
  longer compete with upstream handlers for the same command.
- Admin role handler overrides now apply consistently to list, read, create,
  update, and delete operations.
- Generated controller factories share one typed decorator path, and the
  controller extras contract no longer advertises the unsupported `useHooks`
  option or an unused handler-override alias.
- Recovery password rotation preserves history, strength validation,
  transactions, and credential lifecycle events.
- Node.js 20.19 is the minimum supported runtime: the build is CommonJS and
  loads the ESM Nest 12 / `@concepta/nestjs-*` 8 line through `require(esm)`
  (Node 20.18 fails with `ERR_REQUIRE_ESM`; `engines` says `>=20.19.0`).

### Fixed

- **Admin user / role update bodies are validated again.** Both admin CRUD
  modules declared the update body at controller level; upstream stamps the
  validation pipe from the OPERATION-level body only, so `PATCH /admin/users/:id`
  and `PATCH /admin/roles/:id` were documented and validated by nothing. The
  body now lives on the Update operation (and is `$ref`'d in the document as
  `RocketsAuthUserUpdateDto` / `RocketsAuthRoleUpdateDto`).
- **`PATCH /admin/users/:id` no longer answers 500.** `UpdateUserHandler` ran
  upstream's update (which opens and commits its own scope) and then queried
  the metadata on the same context, which still carried the finished
  transaction (conceptadev/nestjs-modules#468). The handler now runs the
  whole update in one outermost `TransactionScope`, like signup and recovery.

### Removed

- `RocketsAuthExceptionsFilter` (issue #87). Internal-only and never
  exported from `src/index.ts`, so no consumer could import it and no
  application's behaviour changes — apps register
  `RocketsCoreExceptionsFilter` themselves (as
  `examples/sample-server-auth` already did) and are unaffected. Its sole
  caller was this package's own e2e app helper, which now registers
  `RocketsCoreExceptionsFilter` so the suite exercises the production
  path, and accepts an optional error serializer.
- `RocketsAuthUserMetadataCreateDtoInterface`, an unused pre-1.0 alias. Use
  `RocketsAuthUserMetadataCreatableInterface` instead.
- The nonfunctional `rockets-auth-swagger` manifest entry. Applications
  generate OpenAPI from their own complete Nest entry module.

## [1.0.0-alpha.7] - 2026-02-19

### Changed

- **NestJS 11 upgrade**: Bumped all `@nestjs/*` dependencies to v11
  (`@nestjs/common`, `@nestjs/core`, `@nestjs/swagger`, `@nestjs/jwt`,
  `@nestjs/passport`, `@nestjs/config`, `@nestjs/throttler`, `@nestjs/testing`,
  `@nestjs/typeorm`, `@nestjs/platform-express`) and updated `@concepta/*`
  packages from `7.0.0-alpha.8` to `7.0.0-alpha.10`.
- **Invitation acceptance module**: Simplified and consolidated module
  definition; reduced boilerplate in `invitation-acceptance-data.interface` and
  acceptance controller.
- **Admin module**: Refactored `RocketsAuthAdminModule` for consistency; added
  CRUD relations support for roles in `RocketsAuthRoleAdminModule`.
- **Options interfaces**: Trimmed verbose JSDoc in
  `rockets-auth-options-extras.interface` and `rockets-auth-options.interface`
  to concise descriptions.
- **Module definition**: Simplified `rockets-auth.module-definition`
  configuration and provider setup.
- **Fixture imports**: Replaced deep `dist/` imports with root package imports
  for `auth-jwt`, `auth-refresh`, and `authentication` service fixtures.
- **Swagger generation**: Added `stripTopLevelResponseSchemas` cleanup pass, set
  contact and license metadata, and updated generated `swagger.json`.

### Added

- **Compatibility shim**: New `shared/compat/concepta-internals.ts` centralizes
  all deep `@concepta/*/dist` imports to minimize churn when upstream packages
  update exports.
- **Admin relations e2e tests**: New `rockets-auth-admin.relations.e2e-spec.ts`
  covering user-role CRUD relation endpoints.

## [1.0.0-alpha.5] - 2026-02-03

### Added

- **Password change endpoint**: New authenticated endpoint for users to change
  their password (`me-password` controller and DTO).
- **Invitation system**: CRUD relations and comprehensive documentation for the
  invitation flow.

### Changed

- **Role update DTO and interface**: `RocketsAuthRoleUpdatableInterface` and
  role update DTO now treat `id` as optional (partial). This supports
  PATCH-style APIs where the role id is provided in the URL (e.g.
  `PATCH /roles/:id`) and the body only contains fields to update. Apps that
  require `id` in the body can still declare `id!: string` on their extended
  DTO.
- **User metadata model service**: Aligned `RocketsAuthUserMetadataModelService`
  with shared user-metadata model service interface and SDK patterns.
- **User DTOs and interfaces**: User create/update/metadata DTOs and interfaces
  updated; user metadata module definition and signup module adjustments.
- **Invitation**: Acceptance, reattempt, and revocation controllers and DTOs;
  invitation acceptance module and OTP settings.
- **Fixtures and tests**: Updated role and user DTO fixtures; admin and signup
  module specs; e2e and notification/OTP service tests.
- **Renaming and configuration**: Module and option renames; shared config and
  constants updates.

## [1.0.0-alpha.4] - 2026-01-23

### Changed

- **User response DTO**: Updated user response DTO for consistency with API
  responses and user metadata.

## [1.0.0-alpha.3] - 2026-01-22

### Changed

- **Type handling**: Add type string to array for DTOs and validation.

## [1.0.0-alpha.2] - 2025-12-03

### Added

- **Invitation feature**: Full invitation flow with CRUD, acceptance
  validations, and security improvements.

### Changed

- **Invitation acceptance**: Improved validation and security on invitation
  flow.
- **User metadata**: Updates to user metadata handling and DTOs.
- **Packages**: Removed prepublish from packages; version and yarn updates.
- **Tests and tooling**: Test fixes, Codacy and lint updates.

## [1.0.0-alpha.1] - 2025-10-28

### Changed

- **NPM package metadata**: Improved package metadata and configuration for
  publishing.
- **Config**: Package and build configuration updates.

## [1.0.0-alpha.0] - 2025-10-28

### Added

- Initial alpha release of Rockets Auth - Complete authentication and
  authorization solution
- JWT authentication with access and refresh tokens
- Local authentication (username/password)
- OAuth 2.0 integration (Apple, GitHub, Google)
- OTP (One-Time Password) support for 2FA
- Email-based account recovery system
- **User Invitation System**: Admin-controlled invitation flow with OTP
  validation
  - Create and send invitations via email
  - Secure OTP-based invitation acceptance
  - Automatic user account creation
  - Event-driven user data processing
  - Role assignment on acceptance
  - User metadata support (firstName, lastName, custom fields)
  - Invitation revocation and reattempt functionality
- Role-Based Access Control (RBAC) with AccessControl integration
- User management with admin endpoints
- Federated authentication support
- Account verification via email
- Signup flow with configurable options
- Throttling/rate limiting integration
- Swagger documentation generator CLI tool (`rockets-auth-swagger`)
- Comprehensive test coverage (unit and e2e tests)

### Authentication Modules

- **JWT Module**: Token-based authentication with configurable secrets
- **Local Auth**: Traditional username/password authentication
- **OAuth Providers**: Apple Sign In, GitHub, Google OAuth
- **Refresh Token**: Secure token refresh mechanism
- **Recovery Module**: Password recovery via email with passcodes
- **Verification Module**: Email verification system
- **OTP Module**: Time-based one-time passwords for 2FA

### Authorization Features

- **Role Module**: Comprehensive role management system
- **Access Control**: Fine-grained permissions with `accesscontrol` library
- **Admin Guards**: Protect admin-only endpoints
- **RBAC Integration**: Role-based access control throughout the application

### User Management

- **User CRUD**: Complete user management endpoints
- **User Roles**: Assign and manage user roles
- **Admin Panel**: Administrative endpoints for user management
- **Signup System**: Configurable user registration flow
- **Invitation System**: Complete invitation workflow with email notifications
  - Admin invitation creation and management
  - OTP-secured invitation acceptance
  - Automatic user account provisioning
  - Customizable email templates
  - Event-driven acceptance processing

### Security Features

- Secure password hashing
- JWT token signing and verification
- Rate limiting and throttling
- Email verification
- Two-factor authentication (2FA) via OTP
- Password recovery system
- Federated authentication

### Developer Experience

- Full TypeScript support
- Jest testing framework integration
- E2E testing with role-based access tests
- Development and watch modes
- Comprehensive documentation
- Example templates for email notifications

### Notes

- This is an alpha release - APIs may change
- Requires Node.js >= 18.0.0
- Compatible with NestJS 10.x
- Includes peer dependencies: `class-transformer`, `class-validator`, `rxjs`
- BSD-3-Clause license

[1.0.0-alpha.7]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.7
[1.0.0-alpha.5]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.5
[1.0.0-alpha.4]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.1
[1.0.0-alpha.0]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.0
