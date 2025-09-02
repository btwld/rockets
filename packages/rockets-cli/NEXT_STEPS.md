# Rockets CLI · Next Steps

This document captures potential enhancements for the CLI and MCP server based on the Development Guides and Rockets Server SDK.

## Prioritized Roadmap

1) Dry run + config defaults
- Add `--dry-run` and an MCP tool `dry_run_generate` to return a virtual file map (no writes)
- Support `.rocketsrc` (JSON) to set defaults: `outDir`, `typeorm`, `preset`, lint/test toggles

2) Relations and enums
- Fields syntax: `author:belongsTo(User)`, `tags:hasMany(Tag)`
- Enum syntax: `category:enum(Tech,Fiction,Other)`
- Reflect in entity, interfaces, DTOs, and validation decorators

3) Validation + auto-fixes
- CLI/MCP `validate_module` to scan modules for guide compliance (DTO decorators, access decorators, exception patterns)
- `apply_fixes` to add missing decorators (e.g., `@IsOptional()`), `@AccessControl*`, and error codes

4) Per-pattern generators & wiring
- Commands: `generate:entity|dto|exception|model-service|crud-adapter|crud-service|controller|access|types|module|index`
- Auto-wire controller/service/providers in the module; update local `index.ts`
- Optional: update root `AppModule` imports with a flag

5) Presets / profiles
- `--preset` to switch between Direct CRUD vs ConfigurableCrudBuilder patterns
- `--sdk-profile` for Rockets Server specifics (exception hierarchy, DTO bases, access control hooks)

6) Idempotency & merges
- `--skip-existing`, `--force`, `--dry-run` across all generators
- Intelligent edits (insert if missing, update if partial) to avoid clobbering user code

7) Testing, linting, docs
- Scaffold test stubs (unit + e2e) with Jest for generated modules
- Optional post-gen: run `eslint`/`tsc` and report quickly
- Inject `@ApiTags`, complete `@ApiProperty`, and bearer auth where relevant

8) Migrations & seeders
- Optionally generate a TypeORM migration for the new entity
- Seed generators and test factories for sample data

## MCP Tooling (AI-first)

- `generate_module` (existing): Keep as main codegen entrypoint
- `dry_run_generate`: Return file map `{ path, content }[]` without writing
- `list_patterns`: Expose supported patterns, field syntax examples, and defaults from `.rocketsrc`
- `validate_module`: Analyze module and return issues + suggested fixes
- `apply_fixes`: Apply a curated set of safe auto-fixes
- `discover_context`: Report project defaults (SDK present, `.rocketsrc`, db flavor)
- `preview_wiring`: Show planned AppModule/module edits before apply

## Rockets Server–Specific Enhancements

- Admin/user wiring helper for `RocketsServerModule.forRootAsync` (`userCrud` toggle)
- Access control roles scaffolding (resource types + default role logic)
- Exception hierarchy scaffolding with consistent error codes and status
- DTO composition helpers using `CommonEntityDto`, strict `PickType`/`OmitType`
- ConfigurableCrudBuilder preset output where applicable

## Safety & Polish

- Reserved-name and path guards to avoid collisions
- Consistent case conversions (kebab, pascal, constant)
- Non-TypeORM path preserved (toggle already supported); allow future Prisma preset
- Optional localization hooks for validation messages

## Notes on Architecture Choices

- CLI: commander + TypeScript (tsx for dev, tsc for build) is the right trade-off for small, fast tooling
- MCP server: thin stdio wrapper is ideal; NestJS would add boilerplate without clear value here
- Consider `nest-commander` only if CLI grows into a DI-heavy suite sharing runtime with a Nest app

## Suggested Implementation Order

1. `.rocketsrc` + `--dry-run`
2. Relations + enums syntax
3. `validate_module` + `apply_fixes`
4. Per-pattern commands + wiring updates
5. Testing/lint/docs scaffolds
6. Migrations/seeders

---
This roadmap will keep generated code aligned with the Development Guides while making the tools safer and more AI-friendly.
