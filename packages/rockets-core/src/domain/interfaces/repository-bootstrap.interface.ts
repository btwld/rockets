import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';

/**
 * Adapter that, in addition to `forFeature`, knows how to create the
 * root persistence connection given the full entity set the app uses.
 *
 * Implementations are 100% adapter-specific (TypeORM, Firestore, …);
 * `rockets-core` only consumes the contract and never imports a
 * concrete ORM. When `RocketsCoreModule` receives a `RepositoryBootstrap`
 * as its `repository`, it pulls every entity registered through
 * `resources[]` / `userMetadata` and forwards them to `forRoot` — so
 * the user lists each entity exactly once at the bundle level.
 */
export interface RepositoryBootstrap extends RepositoryModuleInterface {
  forRoot(entities: ReadonlyArray<Type<PlainLiteralObject>>): DynamicModule;
}

export function isRepositoryBootstrap(
  value: unknown,
): value is RepositoryBootstrap {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { forRoot?: unknown }).forRoot === 'function'
  );
}
