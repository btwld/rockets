# Changelog

All notable changes to the `@bitwild/rockets-auth` package will be
documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.0] - 2025-10-28

### Added

- Initial alpha release of Rockets Auth - Complete authentication and
  authorization solution
- JWT authentication with access and refresh tokens
- Local authentication (username/password)
- OAuth 2.0 integration (Apple, GitHub, Google)
- OTP (One-Time Password) support for 2FA
- Email-based account recovery system
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
- **Access Control**: Fine-grained permissions with `accesscontrol`
  library
- **Admin Guards**: Protect admin-only endpoints
- **RBAC Integration**: Role-based access control throughout the
  application

### User Management

- **User CRUD**: Complete user management endpoints
- **User Roles**: Assign and manage user roles
- **Admin Panel**: Administrative endpoints for user management
- **Signup System**: Configurable user registration flow

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
- Includes peer dependencies: `class-transformer`, `class-validator`,
  `rxjs`
- BSD-3-Clause license

[1.0.0-alpha.0]: https://github.com/btwld/rockets/releases/tag/v1.0.0-alpha.0
