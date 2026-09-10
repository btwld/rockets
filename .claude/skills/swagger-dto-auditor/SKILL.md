---
name: swagger-dto-auditor
description: Audit request/response zod schemas so every route contract appears in Swagger/OpenAPI as a named component and is actually validated. Use when adding or changing schemas, when a component is missing from the /api docs or the generated schema is empty, or when reviewing a controller's request/response contracts. Triggers on "missing in swagger", "empty schema", "review this schema", "update swagger".
---

# Swagger / DTO Auditor

There are no DTO classes and no `@ApiProperty()` in this repo (RFC #104). The OpenAPI document is generated
from zod schemas: a schema is documented as a named component because it is wrapped LAST with
`withOpenApi(schema, 'XDto')`, and the Rockets document converter `$ref`s it.

## Rules

- Every request/response schema on a route must be named (`withOpenApi(schema, id)`) and wrapped LAST —
  `.extend()` / `.strict()` / `.optional()` after the wrap drop the id and the component silently disappears.
- Hand-written routes declare `@Body/@Query/@Param({ schema })` and `@ApiResponse({ standardSchema })`, and carry
  `@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))` — a `schema` without a pipe documents a
  body that is never validated.
- Response schemas must strip undeclared keys: `.passthrough()` / `.catchall()` anywhere in the tree is a finding
  (`assertFailClosedResponse` rejects it at boot for generated and declared resources).
- Generated resources (`zodResource`, `defineResource`, `operationResource`) name their components automatically
  (`XResponseDto`, `XCreateDto`, `XPaginatedDto`, `<op>Input` / `<op>Output`) — do not add ids by hand there.
- Two DIFFERENT schema instances claiming one id fail at document build; reuse the instance or rename.

## How to audit

1. `grep -rn "@Expose()" packages/*/src/**/*.dto.ts` and verify each Swagger-visible field nearby also has
   `@ApiProperty`/`@ApiPropertyOptional` — a field with only `@Expose` is a finding.
2. For each DTO property meant to be public, confirm a Swagger decorator with an accurate `type`/`enum`/`required`.
3. Boot the app and check `/api` (or the configured `SWAGGER_UI_PATH`): the endpoint's schema must list every field.
   The auth package's contract truth is `packages/rockets-server-auth/swagger/swagger.json`.
4. After changes, regenerate/diff the swagger artifact if the package ships one.

## Boundaries

- Swagger registration lives in **core** (both server and auth need docs from one registration) — don't move it.
- Don't deep-import `@nestjs/swagger/dist/...` internal types; under nodenext that subpath is blocked. Use the public
  API, or inline the small type with a comment if it isn't exported.
- Fix the decorator — never disable validation or cast to satisfy the schema.
