import { RepositoryModuleInterface } from '@concepta/nestjs-repository';

import { SchemaEntityCompiler } from './schema-entity-compiler.interface';

/**
 * Rockets extension of the upstream {@link RepositoryModuleInterface}.
 *
 * Adds the optional schema-first capability: compile a declarative
 * validation schema into the adapter's entity representation. Schema-first
 * resource layers (e.g. the zod layer) resolve the compiler from the same
 * `repository` option that selects the adapter, keeping entity generation
 * adapter-owned — see {@link SchemaEntityCompiler} for the contract.
 *
 * Kept here (not in `rockets-repository`) so that package stays byte-identical
 * to upstream `@concepta/rockets-repository`.
 */
export interface RocketsRepositoryModuleInterface
  extends RepositoryModuleInterface {
  readonly entityCompiler?: SchemaEntityCompiler;
}
