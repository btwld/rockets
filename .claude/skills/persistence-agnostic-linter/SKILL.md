---
name: persistence-agnostic-linter
description: Audit and fix persistence wiring so the repository adapter (TypeORM/Firestore/other) stays swappable. Use when adding or reviewing entity/repository code, when you see @InjectRepository or a module-local TypeOrmModule.forFeature, or when checking that core/feature packages don't hard-require an ORM. Triggers on "is this persistence swappable", "register this entity", "review repository usage".
---

# Persistence-Agnostic Linter

The supported contract is `RepositoryInterface` + dynamic repository keys. Concrete backends are selected in
module options and must stay swappable. Flag and fix anything that nails the code to one ORM.

## Reject these

- `@InjectRepository(...)` / importing `Repository` from `typeorm` in core or feature code.
- A module-local `TypeOrmModule.forFeature([...])` to register a feature entity.
- ORM types (`FindManyOptions`, `DeepPartial`, `SaveOptions`, TypeORM `EntityManager`) in `rockets-core`
  public surface, types, or docs.
- The same entity/key registered in two places, or key and class split across files.

## Require instead

- `@InjectDynamicRepository(KEY)` + `RepositoryInterface<Entity>`. Feature/server code imports these from
  `@bitwild/rockets-core` (it re-exports `InjectDynamicRepository`, `RepositoryInterface`,
  `RepositoryModuleInterface`, `Where`, `getDynamicRepositoryToken`). Only core/lower packages import from
  `@bitwild/rockets-repository` directly.
- Entity registration through bundles in `resources[]`: `defineResource()` auto-contributes its entity row;
  `defineModuleResource({ entities: [...] })` contributes extra rows; `userMetadata.entity` for the metadata row.
- A single top-level `repository: RepositoryModuleInterface` (default adapter) at the module root; per-entity
  `repository` override only when one table needs a different backend. No `repositories.entities[]` block.
- For the zod layer: entity generation goes through a `SchemaEntityCompiler` adapter (e.g.
  `typeOrmZodEntityCompiler`), never TypeORM imported directly into `rockets-zod`.

## How to audit

1. `grep -rn "@InjectRepository\|from 'typeorm'\|TypeOrmModule.forFeature" packages/*/src` — every hit in core or a
   feature is a finding (example/sample apps may legitimately pick TypeORM as the concrete adapter).
2. Confirm each entity is registered exactly once, via a bundle, not a module-local `forFeature`.
3. Confirm `rockets-core` builds and type-checks with no ORM symbol in its public `index.ts`.

When you fix a violation, migrate it to the dynamic-repository pattern — do not cast around the type. If a real
gap blocks the abstraction, stop and ask rather than leaking the ORM.
