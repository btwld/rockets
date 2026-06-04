import type { PlainLiteralObject } from '@nestjs/common';

/**
 * Minimal repository-context shape consumed by upstream CQRS commands
 * (`UpdateUserCommand`, `RemoveUserCommand`, `CrudListQuery`, …) as their
 * first argument.
 *
 * Structurally equivalent to the upstream `RepositoryContextInterface`
 * declared in `@bitwild/rockets-repository@v8.0.0-alpha.5` — kept local
 * because the upstream type is not exported on the public barrel
 * (only the `RepoCtx` overlay ref is). Defining it here avoids a deep
 * `/dist/` import.
 */
export interface RepositoryContextInterface extends PlainLiteralObject {
  entity: string;
}

/**
 * Builds a minimal `RepositoryContextInterface` for CQRS delegation.
 * Used by every Rockets handler that delegates to upstream Concepta
 * commands/queries which require a context as their first argument.
 */
export function createRepositoryContext(
  entityKey: string,
): RepositoryContextInterface {
  return { entity: entityKey };
}
