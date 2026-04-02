---
globs: "packages/rockets-server-auth/src/**/*.ts"
description: Upstream delegation pattern for v8 Concepta packages
---

# Upstream Delegation Pattern (MANDATORY)

When `@concepta/nestjs-user` (or another `@concepta/nestjs-*` v8 package) already provides a command, query, or repository, **delegate via `CommandBus`/`QueryBus`** — do NOT reimplement.

## Key Rules

- Do NOT create a local `UserRepository` — upstream handles find/save/remove with proper aggregate events and TX.
- Do NOT reimplement find-by-id + throw-not-found — upstream handlers already do this.
- Local commands/queries only for rockets-specific logic (e.g., `CreateOrUpdateUserMetadataCommand`, `SignupUserCommand`).
- Upstream commands return **aggregates** — use `.toPlain()` for entity shape.

## v8 Package Reference

All `@concepta/nestjs-*` v8 at `8.0.0-alpha.2`.

Key imports:
- `@concepta/nestjs-common`: `EventContextHost`, `EntityHeaderInterface`, `RuntimeException`, `RepositoryContextInterface`
- `@concepta/nestjs-common/aggregate`: `DomainAggregate`, `DomainMapper`, `DomainAggregateDto`
- `@concepta/nestjs-repository`: `RepositoryModule`, `RepositoryInterface`, `TransactionScope`, `Where`, `getDynamicRepositoryToken`
- `@concepta/nestjs-repository-typeorm`: `TypeOrmRepositoryModule`, `TypeOrmRepository`
- `@concepta/nestjs-user`: `CreateUserCommand`, `UpdateUserCommand`, `RemoveUserCommand`, `GetUserQuery`, `GetUserByEmailQuery`, `GetUserByUsernameQuery`, `UserModule`
- `@concepta/nestjs-crud`: `CrudModule`, `ConfigurableCrudBuilder`, `CrudService`
