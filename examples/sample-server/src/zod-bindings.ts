import { bindZodResources } from '@bitwild/rockets-core/zod';
import {
  typeOrmZodEntityCompiler,
  compileEntity,
} from '@bitwild/rockets-repository-typeorm/zod';

/**
 * THE app-level persistence-compiler choice — one line, one place.
 *
 * The zod layer never hardwires an ORM: entity generation goes through
 * the adapter-neutral `SchemaEntityCompiler` contract
 * (`@bitwild/rockets-core`). Swapping the whole app to another store is
 * changing the import below (e.g. to a `firestoreZodEntityCompiler`)
 * plus the `repository:` adapter in app.module. Schemas, resources,
 * DTOs and Swagger stay untouched.
 *
 * Schema files that compile their entity eagerly (to bind an
 * `@EntityHook` or an inverse `@OneToMany`) import `zodEntityCompiler`
 * from here; resource files import the bound `zodResource` /
 * `zodSubResource`.
 */
export const zodEntityCompiler = typeOrmZodEntityCompiler;
/**
 * Typed entity compiler — returns `Type<SchemaPersistenceRow<S>>` so a
 * generated entity can satisfy class-typed APIs (`OwnerScopeHook.for`,
 * `defineResource`) with the in-memory persistence row shape (ISO
 * datetimes as `Date`), not the OpenAPI wire shape.
 */
export const compileZodEntity = compileEntity;
export const { zodResource, zodSubResource, defineUserMetadata } =
  bindZodResources(zodEntityCompiler);
