# Public API Policy

The `exports` maps in the six publishable package manifests define the only
supported import paths. Deep paths under `src/` or `dist/` are internal unless
a manifest exposes them explicitly.

[`public-api-reports.json`](public-api-reports.json) is generated from a fresh
build and records, for all eight TypeScript entry points, every exported name,
whether it exists at runtime, its declaration signature, and the same-package
declarations reachable through that signature. CI byte-compares it, so the
published surface cannot change unreviewed.

Nothing beyond `0.0.1-dev.0` is published yet, so today this is a design gate
rather than a consumer-compatibility gate: it forces the 1.0 surface to be a
decision instead of an accident, while changing it is still free. The
consumer-migration obligations below apply from 1.0 onward.

## Compatibility decisions

- The unused pre-1.0 aliases `RocketsAuthUserMetadataCreateDtoInterface` and
  `ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN` are removed. Use
  `RocketsAuthUserMetadataCreatableInterface` and `ROCKETS_CORE_SETTINGS_TOKEN`,
  respectively.
- `ExceptionsFilter` remains the supported server compatibility name because
  the reference applications actively consume it. Its canonical implementation
  is `RocketsCoreExceptionsFilter`.
- Runtime helpers have one implementation owner. Core owns the error-logging
  helpers; server and auth preserve their root export names by re-exporting
  core's declarations and runtime values.
- `ErrorDetails` fields stay mutable. `@concepta/rockets-auth` published the
  shape without `readonly` before core became the single owner, so restoring
  `readonly` would narrow an already-published type.
- `@concepta/rockets` is a curated facade, not an `export *` of core; its README
  lists the seams that stay core-only. Do not widen it to equalize package
  counts — adding a name is a commitment just as removing one is.
- `@concepta/rockets-repository-typeorm` intentionally re-exports its upstream
  package verbatim. That is a deliberately large commitment, and the report
  captures it.
- Source-only re-export shims are not public subpaths. Keep one while live code
  or fixtures use it as an internal boundary; delete it when nothing consumes
  it. Pre-1.0 status alone is not a reason to remove a shim.
- RFC #104 (schema engine, pre-1.0): every request/response contract is a
  named zod schema; the class-DTO surface (`createPaginatedDto`, `FreeFormJson`,
  `whitelistedFromDto`, `compileDtoClass` / `namedZodDto`, `MeController`, the
  `UserUpdateDto` / `UserResponseDto` and `RocketsAuth*Dto` classes, the
  `standard-schema` subpaths) is removed rather than deprecated, and
  `class-validator` / `class-transformer` / `nestjs-zod` are no longer peers.
  Migration notes live in the root `CHANGELOG.md` (stages 1–6).
- RFC #104 also renames OpenAPI components that generated clients depend
  on: `AuthenticationResponseDto` → `AuthenticationResponse`, `UserDto` /
  `RoleDto` → `RocketsAuthUserDto` / `RocketsAuthRoleDto`, one
  `<Resource>PaginatedDto` per list instead of the shared
  `CrudResponsePaginatedDto`, and `CrudInvalidResponseDto` removed. Wire
  shapes are unchanged; the note for consumers is in
  `packages/rockets-server-auth/CHANGELOG.md`.

## Updating the report

1. Review the consumer and compatibility impact.
2. Update the relevant README, and add a migration note when consumers must
   change code.
3. Run `yarn api:report:update`; it rebuilds before replacing the report.
4. Review the JSON diff as part of the change — generation is not approval.

The report is a review tripwire, not proof of semantic compatibility. A diff
can reflect a compiler or declaration-spelling change, while assignability and
runtime behavior still require the typecheck and packed-consumer gates.
