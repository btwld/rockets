import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';

export function resolvePersistenceAdapter(
  override: RepositoryModuleInterface | undefined,
  rootAdapter: RepositoryModuleInterface | undefined,
  origin: string,
): RepositoryModuleInterface {
  const adapter = override ?? rootAdapter;
  if (!adapter) {
    throw new Error(
      `buildAppRegistrationPlan: ${origin} has no persistence adapter — ` +
        `set \`extras.repository\` at the root or supply \`repository\` on the entry.`,
    );
  }
  return adapter;
}
