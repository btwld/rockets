import { bindZodResources } from '@bitwild/rockets-core/zod';
import { typeOrmZodEntityCompiler } from '@bitwild/rockets-zod-typeorm';

/**
 * The app-level persistence-compiler choice — one line, one place.
 *
 * The zod layer never hardwires an ORM: entity generation goes through the
 * adapter-neutral `SchemaEntityCompiler` contract. Swapping the SQLite-backed
 * resources to another store is changing the import below plus the matching
 * `repository:` adapter; schemas, resources, DTOs and Swagger stay untouched.
 *
 * (The Firestore-backed code-review report stays on its own
 * `defineFirestoreRepository` adapter — there is no zod→Firestore entity
 * compiler yet, so that document is not driven from a zod schema.)
 */
export const zodEntityCompiler = typeOrmZodEntityCompiler;
export const { zodResource, zodSubResource, defineUserMetadata } =
  bindZodResources(zodEntityCompiler);
