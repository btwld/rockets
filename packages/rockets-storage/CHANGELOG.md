# Changelog

## Unreleased

### Fixed

- **Driver subpaths were unreachable on legacy TypeScript resolution.**
  `typesVersions` mapped only `core` and `files-sdk`, so a project on
  `moduleResolution: "Node"` — which `examples/sample-server` and Nest's own
  scaffolding use — could type a `StorageDriver` but never import one:
  `@concepta/rockets-storage/files-sdk/fs` failed with TS2307. Every subpath
  is mapped now. The remaining caveat is upstream's: the driver `.d.ts`
  re-export types from `files-sdk`, which ships an export map and no
  `typesVersions`, so a Node10 project needs `skipLibCheck: true` (the
  default in Nest's scaffolding) to avoid type-checking into it. The
  packed-consumer gate pins both cases with separate fixtures.

### Added

- Initial `@concepta/rockets-storage` preview with a provider-neutral storage
  client and driver contract, named NestJS stores, streaming operations,
  normalized errors, conditional mutations, signed transfers, cross-store
  workflows, and Files SDK adapters for filesystem, runtime-selected, and
  S3-compatible providers.
