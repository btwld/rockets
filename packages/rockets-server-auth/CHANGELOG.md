# Changelog

All notable changes to the `@bitwild/rockets-auth` package will be
documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.5] - 2026-02-03

### Added

- **Password change endpoint**: New authenticated endpoint
  for users to change their password
  (`me-password` controller and DTO).
- **Invitation system**: CRUD relations and comprehensive
  documentation for the invitation flow.

### Changed

- **Role update DTO and interface**:
  `RocketsAuthRoleUpdatableInterface` and role update DTO
  now treat `id` as optional (partial). This supports
  PATCH-style APIs where the role id is provided in the
  URL (e.g. `PATCH /roles/:id`) and the body only contains
  fields to update. Apps that require `id` in the body can
  still declare `id!: string` on their extended DTO.
- **User metadata model service**: Aligned
  `RocketsAuthUserMetadataModelService` with shared
  user-metadata model service interface and SDK patterns.
- **User DTOs and interfaces**: User create/update/metadata
  DTOs and interfaces updated; user metadata module
  definition and signup module adjustments.
- **Invitation**: Acceptance, reattempt, and revocation
  controllers and DTOs; invitation acceptance module and
  OTP settings.
- **Fixtures and tests**: Updated role and user DTO
  fixtures; admin and signup module specs; e2e and
  notification/OTP service tests.
- **Renaming and configuration**: Module and option renames;
  shared config and constants updates.

## [1.0.0-alpha.4] - 2026-01-23

### Changed

- **User response DTO**: Updated user response DTO for
  consistency with API responses and user metadata.

## [1.0.0-alpha.3] - 2026-01-22

### Changed

- **Type handling**: Add type string to array for DTOs
  and validation.

## [1.0.0-alpha.2] - 2025-12-03

### Added

- **Invitation feature**: Full invitation flow with CRUD,
  acceptance validations, and security improvements.

### Changed

- **Invitation acceptance**: Improved validation and
  security on invitation flow.
- **User metadata**: Updates to user metadata handling
  and DTOs.
- **Packages**: Removed prepublish from packages; version
  and yarn updates.
- **Tests and tooling**: Test fixes, Codacy and lint
  updates.

## [1.0.0-alpha.1] - 2025-10-28

### Changed

- **NPM package metadata**: Improved package metadata and
  configuration for publishing.
- **Config**: Package and build configuration updates.

## [1.0.0-alpha.0] - 2025-10-28

### Added

- Initial alpha release of Rockets Auth - Complete
  authentication and authorization solution
- JWT authentication with access and refresh tokens
- Local authentication (username/password)
- OAuth 2.0 integration (Apple, GitHub, Google)
- OTP (One-Time Password) support for 2FA
- Email-based account recovery system
- **User Invitation System**: Admin-controlled invitation
  flow with OTP validation
  - Create and send invitations via email
  - Secure OTP-based invitation acceptance
  - Automatic user account creation
  - Event-driven user data processing
  - Role assignment on acceptance
  - User metadata support (firstName, lastName,
    custom fields)
  - Invitation revocation and reattempt functionality
- Role-Based Access Control (RBAC) with AccessControl
  integration
- User management with admin endpoints
- Federated authentication support
- Account verification via email
- Signup flow with configurable options
- Throttling/rate limiting integration
- Swagger documentation generator CLI tool
  (`rockets-auth-swagger`)
- Comprehensive test coverage (unit and e2e tests)

### Authentication Modules

- **JWT Module**: Token-based authentication with
  configurable secrets
- **Local Auth**: Traditional username/password
  authentication
- **OAuth Providers**: Apple Sign In, GitHub, Google OAuth
- **Refresh Token**: Secure token refresh mechanism
- **Recovery Module**: Password recovery via email with
  passcodes
- **Verification Module**: Email verification system
- **OTP Module**: Time-based one-time passwords for 2FA

### Authorization Features

- **Role Module**: Comprehensive role management system
- **Access Control**: Fine-grained permissions with
  `accesscontrol` library
- **Admin Guards**: Protect admin-only endpoints
- **RBAC Integration**: Role-based access control
  throughout the application

### User Management

- **User CRUD**: Complete user management endpoints
- **User Roles**: Assign and manage user roles
- **Admin Panel**: Administrative endpoints for user
  management
- **Signup System**: Configurable user registration flow
- **Invitation System**: Complete invitation workflow
  with email notifications
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
- Includes peer dependencies: `class-transformer`,
  `class-validator`, `rxjs`
- BSD-3-Clause license

[1.0.0-alpha.5]: https://github.com/btwld/rockets/releases/tag/v1.0.0-alpha.5
[1.0.0-alpha.4]: https://github.com/btwld/rockets/releases/tag/v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/btwld/rockets/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/btwld/rockets/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/btwld/rockets/releases/tag/v1.0.0-alpha.1
[1.0.0-alpha.0]: https://github.com/btwld/rockets/releases/tag/v1.0.0-alpha.0
