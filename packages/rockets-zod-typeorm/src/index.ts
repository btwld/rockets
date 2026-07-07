// TypeORM implementation of the zod layer's SchemaEntityCompiler
// contract. Bridges @bitwild/rockets-zod (DB-agnostic schema → DTO /
// resource translation) to TypeORM entity classes. Apps wire it once:
//
//   import { bindZodResources } from '@bitwild/rockets-core/zod';
//   import { typeOrmZodEntityCompiler } from '@bitwild/rockets-zod-typeorm';
//   export const { zodResource, zodSubResource } =
//     bindZodResources(typeOrmZodEntityCompiler);
export { compileEntity, typeOrmZodEntityCompiler } from './compile-entity';
export type { CompileEntityOptions } from './compile-entity';
