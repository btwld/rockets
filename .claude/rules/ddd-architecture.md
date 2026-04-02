---
globs: "packages/rockets-server-auth/src/**/*.ts"
description: DDD / Clean Architecture enforcement for the auth package
---

# DDD / Clean Architecture (MANDATORY)

Full reference: `packages/rockets-server-auth/DDD_REFERENCE.md` — read it before creating or moving files.

## Layer Rules

1. **Domain** (`domain/`): Zero framework imports. Aggregates, events, exceptions, repository interfaces, domain services, pure utils.
2. **Application** (`application/`): Command/query handlers via `@nestjs/cqrs`. Orchestrate domain logic.
3. **Infrastructure** (`infrastructure/`): Persistence (repo impl + mapper), DTOs, config, provider factories, services that inject repositories.
4. **Gateway** (`gateways/`): HTTP entry points. `@Injectable()` request handlers that delegate to `CommandBus`/`QueryBus`.
5. **Interfaces** (`interfaces/`): Public API surface — types consumers import. NOT domain-layer interfaces.

## File Placement

| File type | Location |
|---|---|
| Domain exceptions | `domain/exceptions/` |
| Domain events | `domain/events/` |
| Domain repository interfaces | `domain/repositories/` |
| Constants, injection tokens | `infrastructure/config/` |
| Services with repo injection | `infrastructure/services/` |
| Persistence (repo impl, mapper) | `infrastructure/persistence/` |
| DTOs (class-validator) | `infrastructure/dto/` |
| Provider factories | `infrastructure/utils/` |
| Command/query impl + handlers | `application/commands/` or `application/queries/` |
| Event listeners | `application/listeners/` |
| HTTP request handlers | `gateways/http/` |
| Public interfaces | `interfaces/` (domain root) |

**Legacy locations to avoid:** Do NOT place files in flat `constants/`, `services/`, or root-level exception files.

## Mandatory Patterns

- **Aggregates**: Extend `DomainAggregate<T>`. Static factories take `EventContextHost` as first arg.
- **Mapper**: `DomainMapper<Entity, Props, Aggregate>` with `createAggregate()`.
- **Repository**: Constructor takes `(repository, mapper)`. Use `Where.for<Entity>()`. Return `null` on not-found.
- **Commands/Queries**: Pure data carriers, no logic.
- **Handlers**: Stateless. Wrap mutations in `txScope.run()`. Use `eventPublisher.mergeObjectContext(agg)`.
- **DTOs**: `@Exclude()` class-level + `@Expose()` per field. Extend `DomainAggregateDto`.
- **Exceptions**: Extend `RuntimeException` with `errorCode` and `httpStatus`.
- **Module**: Use `RepositoryModule.forFeature()` + `CqrsModule`. No `CrudAdapter`/`TypeOrmCrudAdapter`.

## What NOT to Do

- No `UseCase` classes — logic goes in command/query handlers.
- No `CrudAdapter` or `TypeOrmCrudAdapter` (v7, removed in v8).
- No `TypeOrmExtModule.forFeature()` (v7). Use `RepositoryModule.forFeature()` + `TypeOrmRepositoryModule`.
- Always check upstream exports before writing local infrastructure.
