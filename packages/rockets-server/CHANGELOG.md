# Changelog

All notable changes to the `@concepta/rockets` package will be documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation

- Document `operationResource` / `defineOperationResource` as first-class
  `resources[]` bundles (import from `@concepta/rockets-core` /
  `@concepta/rockets-core/zod`; not yet on the curated `@concepta/rockets`
  facade). See root `CONFIGURATION.md` §6a.

### Release preparation

- Package manifest set to `1.0.0-alpha.8`; registry publication is
  pending.

### Added

- `createServer(definition)`, the canonical launch-facing facade that returns a
  Nest entry module for direct use with `NestFactory.create()`.
- `defineAuthAdapter(Adapter, options?)`, a complete host module for custom
  authentication adapters.
- Auth integrations can contribute owned resources, user metadata, a root
  repository, and a default guard preference through `AuthBootstrap`.
- Executable coverage for direct server launch, ordered multi-credential auth,
  private-by-default routes, and metadata-free micro apps.

### Changed

- **`ROCKETS_DISABLE_GUARDS_TOKEN` is no longer re-exported.** Read the
  `AuthPublic` metadata with `isAuthPublic()` from
  `@concepta/nestjs-authentication` instead of the key.

- `class-validator` / `class-transformer` are no longer peers (RFC #104,
  stage 6).
- **`/me` on the schema engine (RFC #104, stage 4).** `MeController` is
  replaced by `buildMeController(config)` — a factory built from the app's
  `userMetadata` config (`updateSchema` / `responseSchema`). `PATCH /me`
  validates `{ userMetadata?: UserMetadataUpdateDto }` through the per-route
  Standard Schema pipe (`400` with `details[].path = ['userMetadata', field]`);
  both routes serialize through `UserResponseDto` (`meResponseSchema`), so a
  userMetadata column hidden with `dto: { response: false }` stays hidden;
  `userMetadata` is `null` before the first PATCH (was `{}`).
  `UserModule.register(config)` takes the same config. Exports
  `buildMeController`, `meUpdateSchema`, `meResponseSchema`; removes
  `MeController`, `ROCKETS_USER_METADATA_DTO_TOKEN`, `RocketsUserMetadataDtoConfig`,
  `createPaginatedDto` and the `UserUpdateDto` / `UserResponseDto` /
  `RoleNameDto` / `UserRoleItemDto` re-exports.
- `@nestjs/config` dropped (RFC #104, stage 1). `RocketsModule` registers its
  own default settings provider (`ROCKETS_SERVER_SETTINGS_DEFAULTS_TOKEN`)
  instead of reading core's `registerAs` namespace. Consumers keep passing
  `settings` as before.
- Guard ownership is singular: the presentation layer no longer registers a
  second global auth guard when an auth integration already owns it.
- `RocketsModule` resolves auth contributions before module registration.
  Explicit app options win; conflicting integration defaults fail during
  composition.
- `userMetadata` is optional. The `/me` controller and default metadata
  handlers are registered only when a metadata contract exists.
- Class-wide `@AuthPublic({ classLevel: true })` metadata is honored by
  `AuthServerGuard`.
- TypeORM bootstrap ownership moved to
  `@concepta/rockets-repository-typeorm`; the server no longer depends on
  TypeORM.
- Node.js 20.19 is the minimum supported runtime: the build is CommonJS and
  loads the ESM Nest 12 / `@concepta/nestjs-*` 8 line through `require(esm)`
  (Node 20.18 fails with `ERR_REQUIRE_ESM`; `engines` says `>=20.19.0`).

### Removed

- `ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN`, an unused pre-1.0 alias.
  Import `ROCKETS_CORE_SETTINGS_TOKEN` from this package instead.
- The `rockets-swagger` manifest entry. OpenAPI generation belongs to the
  consumer application because only it owns the complete Nest graph and
  document settings.
- The `createStubAuthBootstrap()` re-export, now that `defineAuthAdapter()`
  covers the same wiring. Replace `createStubAuthBootstrap(Adapter)` with
  `defineAuthAdapter(Adapter)`.
- `RocketsAuthInput`, a bare alias of `RocketsAuthOption`. The canonical
  `RocketsAuthOption` is now exported in its place.

## [1.0.0-alpha.7] - 2026-02-19

### Changed

- **NestJS 11 upgrade**: Bumped all `@nestjs/*` dependencies to v11
  (`@nestjs/common`, `@nestjs/core`, `@nestjs/swagger`, `@nestjs/config`,
  `@nestjs/testing`, `@nestjs/typeorm`, `@nestjs/platform-express`) and updated
  `@concepta/*` packages from `7.0.0-alpha.8` to `7.0.0-alpha.10`.
- **User metadata model service**: `getUserMetadataByUserId` now returns `null`
  instead of throwing `NotFoundException` when no metadata exists, simplifying
  consumer code.
- **Me controller**: Removed redundant try/catch and error logging; relies on
  the model service for error handling.
- **User DTOs**: Added `additionalProperties: true` to Swagger `userMetadata`
  schemas for flexible metadata payloads.
- **Module definition**: `createRocketsControllers` now respects
  `extras.controllers` for custom controller overrides.
- **Options extras interface**: Trimmed verbose JSDoc to concise descriptions.
- **Error handling**: Exception catch blocks now rethrow `HttpException`
  subclasses alongside `RuntimeException`.

### Added

- **User metadata model service unit tests**: Comprehensive spec covering
  exception mapping, CRUD operations, `createOrUpdate`, and `hasUserMetadata`.

### Fixed

- **TypeScript strict mode**: Added definite assignment assertions (`!`) to DTO
  properties in e2e specs and `UserResponseDto`.

## [1.0.0-alpha.5] - 2026-02-03

### Added

- **User metadata model service interface**: `UserMetadataModelServiceInterface`
  and `UserMetadataModelUpdatableInterface` for consistent model-layer contracts
  and SDK patterns.
- **Me controller**: `/me` endpoint now returns authenticated user data with
  user metadata via injectable `UserMetadataModelService`.

### Changed

- **User metadata module**: User metadata model service is now injectable and
  follows the shared `UserMetadataModelServiceInterface` for custom
  implementations.
- **User DTOs**: `UserUpdateDto` and `UserResponseDto` aligned with user
  metadata integration for the me controller.
- **Rockets options**: Extras interface and module definition updates for
  extensibility.

## [1.0.0-alpha.4] - 2026-01-23

### Changed

- **User response DTO**: Updated user response DTO for consistency with user
  metadata and API responses.

## [1.0.0-alpha.3] - 2026-01-22

### Changed

- Type and array handling improvements for DTOs and interfaces.

## [1.0.0-alpha.2] - 2025-12-03

### Changed

- Package and configuration updates; alignment with rockets-server-auth changes.

## [1.0.0-alpha.1] - 2025-10-28

### Changed

- **NPM package metadata**: Improved package metadata and configuration for
  publishing.
- **Config**: Package and build configuration updates.

## [1.0.0-alpha.0] - 2025-10-28

### Added

- Initial alpha release of Rockets core server functionality
- Core NestJS module for rapid API development
- Built-in authentication infrastructure
- User management foundation
- User metadata system
- Swagger documentation generator CLI tool (`rockets-swagger`)
- Exception filtering system
- Authentication guards
- TypeScript support with full type definitions
- Comprehensive test coverage (unit and e2e tests)

### Features

- **RocketsModule**: Core module for application setup
- **User Module**: Base user management functionality
- **User Metadata Module**: Extensible user metadata system
- **Authentication Provider**: Pluggable authentication interface
- **Error Logging Helper**: Centralized error handling
- **Swagger Integration**: Automatic API documentation via
  `@concepta/nestjs-swagger-ui`

### Developer Experience

- Full TypeScript support
- Jest testing framework integration
- E2E testing capabilities
- Development and watch modes
- Comprehensive documentation

### Notes

- This is an alpha release - APIs may change
- Requires Node.js >= 18.0.0
- Compatible with NestJS 10.x
- BSD-3-Clause license

[1.0.0-alpha.7]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.7
[1.0.0-alpha.5]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.5
[1.0.0-alpha.4]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.1
[1.0.0-alpha.0]: https://github.com/conceptadev/rockets/releases/tag/v1.0.0-alpha.0
