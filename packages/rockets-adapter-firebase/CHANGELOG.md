# Changelog

## Unreleased

### Release preparation

- Package manifest set to `1.0.0-alpha.8`; registry publication is
  pending.

### Changed

- Synchronous `defineFirebaseAuth()` options are now flat
  (`defineFirebaseAuth({ firebaseApp })`); asynchronous wiring remains the
  explicit `{ forRootAsync }` variant.
- Node.js 20.19 is the minimum supported runtime: the build is CommonJS and
  loads the ESM Nest 12 / `@concepta/nestjs-*` 8 line through `require(esm)`
  (Node 20.18 fails with `ERR_REQUIRE_ESM`; `engines` says `>=20.19.0`).

## 1.0.0-alpha.0

- Initial public alpha release of the Firebase auth adapter.
