import { RepositoryContextInterface } from '@concepta/nestjs-repository';

/**
 * Creates a minimal RepositoryContextInterface for CQRS delegation.
 *
 * Centralises the `{ entity } as RepositoryContextInterface` pattern
 * used by every Rockets handler that delegates to upstream Concepta commands/queries.
 */
export function createRepositoryContext(
  entityKey: string,
): RepositoryContextInterface {
  return { entity: entityKey } as RepositoryContextInterface;
}
