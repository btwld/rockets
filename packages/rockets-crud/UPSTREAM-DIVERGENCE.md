# Upstream divergence ledger — `@bitwild/rockets-crud`

This package is kept byte-identical to upstream `@concepta/rockets-crud`
(branch `feature/rockets-zero`) so a future migration is a straight swap.
The items below are the **only** intentional source differences. Everything
else that differs is toolchain drift (see "Tooling drift" at the bottom),
not deliberate change.

## Intentional divergences (deliberate, to be upstreamed)

### 1. `src/infrastructure/utils/swagger.helper.ts` — nestjs-swagger v12 compat
Upstream resolves swagger constants via `require('@nestjs/swagger/dist/constants')`.
`@nestjs/swagger@12` blocks that subpath in its `exports` map
(`ERR_PACKAGE_PATH_NOT_EXPORTED`) and exposes `DECORATORS` on the main entry
instead. The 3-line guard picks the main entry when available.
- Cannot be moved to `rockets-common`: the broken value is an internal `const`
  consumed by this package's own swagger decorators — nothing external can
  intercept it.
- Resolution path: contribute the v12 guard to upstream `@concepta/rockets-crud`.

### 2. `src/index.ts` — additive re-exports of upstream-internal symbols
The following symbols live in files that are **byte-identical to upstream**;
upstream simply does not re-export them from its `index.ts`. We do, because
other `@bitwild` packages / examples consume them:
- `CrudCommandHandlerBase` (alias of `CrudCommandHandler` base class)
- `CrudQueryHandlerBase` (alias of `CrudQueryHandler` base class)
- `CrudCommandInterface`, `CrudQueryInterface`
- `CrudRequestConfig`, `CrudResponseConfig`, `CrudParamOptionInterface`,
  `CrudMetaview`
- Cannot be moved to `rockets-common`: it cannot reach package-internal symbols
  without a forbidden deep `dist/` import.
- Resolution path: contribute these re-exports to upstream `index.ts`.

### 3. Standard Schema validation (`crud-init-validation.decorator.ts` + `infrastructure/pipes/crud-standard-schema-validation.pipe.ts`)
Standard Schema (https://standardschema.dev) is the **vendor-neutral** validation
contract NestJS v12 adopts natively — crud imports no validation library (no zod).
When a route's `expectedType` DTO carries a static `schema`, the weave installs
`CrudStandardSchemaValidationPipe` instead of the class-validator `ValidationPipe`
(which would empty schema-only DTOs via `excludeAll`). Cannot live in
`rockets-common` (would cycle: common already depends on crud), and no external
seam can replace the per-body-param decision without re-checking the schema.
- Resolution path: contribute the standard-schema hook upstream.

### 4. `src/infrastructure/decorators/controller/crud-init-api-params.decorator.ts` — v12 swagger types
Upstream reads `options.schema?.type` / `.enum` directly. `@nestjs/swagger@12`
tightened `ApiParamOptions` (`ApiParamSchemaHost` no longer carries top-level
`type`/`enum`), so the upstream form fails type-checking under our toolchain
(`TS2339`, surfaced by ts-jest). The `ApiParamInline` distributive-conditional
view reads both union shapes safely. Behavior identical.
- Resolution path: contribute the v12-safe typing upstream.

## Tooling drift (NOT deliberate — auto-resolves on migration)
Our repo runs ahead of the upstream branch on NestJS 12, and newer
eslint/prettier/TypeScript. This produces small, non-semantic diffs in many
otherwise-identical files. They are NOT reverted (doing so breaks our
build/lint/format) and require no action — they disappear when upstream rebases
onto the same toolchain. Categories:
- eslint disable-comment rename: `@typescript-eslint/ban-types` →
  `@typescript-eslint/no-unsafe-function-type`.
- prettier reformatting (e.g. `(x ?? [])` parenthesization, template-literal
  and ternary wrapping) from a different prettier version.
- TS field-override init: `declare context` + `this.context` vs upstream
  `context` + `super.context` (behavioral no-op).
- NestJS v12 type adaptations: `propertyKey: string | symbol | undefined` +
  guard in `crud-infra.utils.ts`; `crud-body-options.interface.ts` pipe typing
  (`(Type<PipeTransform> | PipeTransform)[]` vs `Parameters<typeof Body>[1][]`).

## Extracted to `@bitwild/rockets-common` (no longer in this package)
- Entity-class `InjectCrudAdapter` (the string-only upstream decorator stays
  here; the class-resolving wrapper lives in `rockets-common`).
