# @bitwild/rockets-common

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-common)](https://www.npmjs.com/package/@bitwild/rockets-common)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Rockets import path for the upstream Concepta motors (`repository`, `crud`,
> `hook`, `common`, `authentication`, `swagger-ui`) plus a handful of local
> helpers.

**Status:** stable (`1.0.0-alpha.9` on npm, dist-tag `alpha`).

---

## Install

```bash
yarn add @bitwild/rockets-common@alpha
```

Usually pulled in transitively by `@bitwild/rockets` or `@bitwild/rockets-core`.
Add explicitly when you import symbols from this package path.

## What it re-exports

| Upstream                          | Symbols (examples)                                                      |
| --------------------------------- | ----------------------------------------------------------------------- |
| `@concepta/nestjs-repository`     | `RepositoryInterface`, `InjectDynamicRepository`, `Where`, transactions |
| `@concepta/nestjs-crud`           | `CrudCreateCommand`, `CrudWithBodyCommandHandler`, `Operation`          |
| `@concepta/nestjs-hook`           | `HookModule`, `Spec`, `UseHooks`                                        |
| `@concepta/nestjs-common`         | `RuntimeException`, domain exceptions                                   |
| `@concepta/nestjs-authentication` | `AuthUser`, `AuthorizedUser`                                            |
| `@concepta/nestjs-swagger-ui`     | Swagger UI module registration                                          |

## Local helpers

- `deriveEntityKey` / `resolveEntityKey`
- `whitelistedFromDto` (Standard Schema DTO validation)
- `stripUndefined`, `createRepositoryContext`
- `getErrorDetails`, `logAndGetErrorDetails`
- `SchemaEntityCompiler` interface (used by `@bitwild/rockets-zod`)

## Dependency rule

This package never imports `@bitwild/rockets-core`. Core depends on common, not
the other way around.
