# Changelog

All notable changes to the `@bitwild/rockets` package will be documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0-alpha.0]: https://github.com/btwld/rockets/releases/tag/v1.0.0-alpha.0
