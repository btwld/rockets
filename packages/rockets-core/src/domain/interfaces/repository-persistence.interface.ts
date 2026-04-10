import { RepositoryModule } from '@bitwild/rockets-repository';

/**
 * Type alias for the options accepted by RepositoryModule.forFeature().
 * This avoids importing the internal RepositoryFeatureOptions interface
 * which is not part of the public API.
 */
export type RepositoryPersistenceConfig = Parameters<
  typeof RepositoryModule.forFeature
>[0];
