import type { PlainLiteralObject, Type } from '@nestjs/common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';

/**
 * A single entity to register as a dynamic repository.
 *
 * Each entry produces one `@InjectDynamicRepository(key)` token.
 * The `module` field overrides the root adapter for this specific entity.
 */
export interface RepositoryRegisterEntry {
  readonly key: string;
  readonly entity: Type<PlainLiteralObject>;
  /** Override the root module for this entity. Defaults to root `module`. */
  readonly module?: RepositoryModuleInterface;
}

/**
 * Unified repository configuration for RocketsCoreModule.
 *
 * - `module` — default persistence adapter (e.g. TypeOrmRepositoryModule).
 * - `userMetadata` — required; core handlers inject `@InjectDynamicRepository('userMetadata')`.
 * - `register` — additional standalone entities needing dynamic repositories
 *   but not declared as CRUD resources.
 *
 * The core flattens this config into `RepositoryModule.forFeature()` calls,
 * grouping entries by their effective module.
 */
export interface RocketsRepositoriesConfig {
  /** Default persistence adapter module (e.g. TypeOrmRepositoryModule). */
  readonly module: RepositoryModuleInterface;

  /** Required — entity for the 'userMetadata' repository. */
  readonly userMetadata: {
    readonly entity: Type<PlainLiteralObject>;
    /** Override root module for userMetadata. Defaults to root `module`. */
    readonly module?: RepositoryModuleInterface;
  };

  /** Additional entities needing dynamic repositories (non-CRUD). */
  readonly entities?: ReadonlyArray<RepositoryRegisterEntry>;
}
