# Changelog

## Unreleased

### Release preparation

- Package manifest set to `1.0.0-alpha.8`; registry publication is
  pending.

### Added

- `defineTypeOrmRepository()`, the adapter-owned `RepositoryBootstrap` that
  combines connection options with the Rockets planner's entity list.

### Changed

- `nestjs-zod` is no longer an optional peer (RFC #104, stage 6).
- Upstream `@concepta/nestjs-repository-typeorm` `8.0.0-alpha.9` (RFC #104,
  stage 4). The zod entity compiler no longer maps `z.iso.datetime()` to a
  datetime column: an ISO-string field is a varchar; `z.date()` / `f.date()` /
  the audit helpers are the datetime columns. `SchemaPersistenceRow<S>` is
  `z.output<S>`.
- `@nestjs/typeorm` is now a required peer dependency, because
  `defineTypeOrmRepository()` builds the TypeORM root module directly.
- Node.js 20.19 is the minimum supported runtime: the build is CommonJS and
  loads the ESM Nest 12 / `@concepta/nestjs-*` 8 line through `require(esm)`
  (Node 20.18 fails with `ERR_REQUIRE_ESM`; `engines` says `>=20.19.0`).
