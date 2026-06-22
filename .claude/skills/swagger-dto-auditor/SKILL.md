---
name: swagger-dto-auditor
description: Audit DTOs so every field that must appear in Swagger/OpenAPI is decorated correctly. Use when adding or changing DTOs, when a field is missing from the /api docs or the generated schema is empty, or when reviewing a controller's request/response contracts. Triggers on "field missing in swagger", "empty schema", "review this DTO", "update swagger".
---

# Swagger / DTO Auditor

The `@nestjs/swagger` CLI plugin is **not** enabled in this repo. Type inference alone will not populate the
OpenAPI schema — every exposed field needs an explicit decorator.

## Rules

- Every field that must show in Swagger needs `@ApiProperty()` (required) or `@ApiPropertyOptional()` (optional).
- `@Expose()` from `class-transformer` is **unrelated** to Swagger — it never populates the schema. Do not trust an
  IDE auto-import that pulls `@Expose` when you meant `@ApiProperty`. Verify the imported symbol's package.
- Decorators come from `@nestjs/swagger`. Confirm the import line, not just the name.
- Nested objects/arrays need `type`/`@Type(() => X)` so the schema resolves the inner shape.
- Response DTOs that implement an interface requiring `id` must actually expose `id` (e.g. extend the upstream
  `…Dto` that carries `DomainAggregateDto`'s `id`/`version`) — a missing `id` is both a Swagger gap and a TS error.

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
