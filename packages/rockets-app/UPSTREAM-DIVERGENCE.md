# Upstream divergence ledger — `@bitwild/rockets-app`

Kept byte-identical to upstream `@concepta/rockets-app`
(branch `feature/rockets-zero`). `src/index.ts` is identical to upstream.

## Intentional divergences
None. All local additions were extracted to `@bitwild/rockets-common`.

## Tooling drift (NOT deliberate — auto-resolves on migration)
- eslint disable-comment rename `@typescript-eslint/ban-types` →
  `@typescript-eslint/no-unsafe-function-type` (`hook.interfaces.ts`,
  `hook.decorator.ts`).
- prettier reformatting in `domain/utils/deep-partial.ts` (different prettier
  version; semantically identical conditional type).

## Extracted to `@bitwild/rockets-common` (no longer in this package)
- `AuthUser` decorator.
- Model interfaces: `ByIdInterface`, `CreateOneInterface`,
  `RemoveOneInterface`, `UpdateOneInterface`.
- Utils: `deriveEntityKey`, `resolveEntityKey`, `whitelistedFromDto`,
  `stripUndefined`, `createRepositoryContext`/`RepositoryContextInterface`,
  `logAndGetErrorDetails`/`getErrorDetails`/`ErrorDetails`.
- Swagger UI module (`SwaggerUiModule`, `SwaggerUiService`, options/settings
  interfaces).
