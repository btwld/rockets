// TypeORM implementation of the zod layer's SchemaEntityCompiler
// contract. Bridges @bitwild/rockets-core/zod (DB-agnostic schema → DTO /
// resource translation) to TypeORM entity classes. Apps wire it once:
//
//   import { bindZodResources } from '@bitwild/rockets-core/zod';
//   import { typeOrmZodEntityCompiler } from '@bitwild/rockets-repository-typeorm/zod';
//   export const { zodResource, zodSubResource } =
//     bindZodResources(typeOrmZodEntityCompiler);
export { compileEntity, typeOrmZodEntityCompiler } from './compile-entity';
export type { CompileEntityOptions } from './compile-entity';
