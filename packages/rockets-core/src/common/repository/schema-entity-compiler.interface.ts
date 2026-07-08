import { PlainLiteralObject, Type } from '@nestjs/common';

/**
 * Options for {@link SchemaEntityCompiler.compileEntity}.
 */
export interface SchemaEntityCompilerOptions {
  /**
   * Entity class name (e.g. `PetEntity`). Drives dynamic-repository key
   * derivation exactly like a handwritten class name would.
   */
  readonly name: string;
  /**
   * Physical storage name — SQL table, document collection, file name…
   * whatever "where rows live" means for the adapter.
   */
  readonly table: string;
}

/**
 * Adapter capability: compile a declarative validation schema into the
 * adapter's entity representation.
 *
 * ## Why this lives here
 *
 * Schema-first layers (e.g. a zod resource layer) own the WIRE contract
 * — DTOs, validation, OpenAPI. What a "persisted entity" looks like is
 * an ADAPTER concern: TypeORM needs a decorated class with column
 * metadata; Firestore needs little more than a named class token plus a
 * collection name; a filesystem/JSON adapter can treat the schema
 * itself as the storage format. The schema layer therefore never
 * compiles entities itself — it asks the adapter through this contract.
 *
 * ## Dependency rule
 *
 * The repository abstraction stays free of any validation-library
 * dependency, so `schema` is typed `unknown`. Implementations narrow it
 * to the schema type they support (e.g. `instanceof z.ZodObject`) and
 * MUST throw a descriptive error for anything else — a wrong schema
 * type is a boot-time configuration bug, never a silent fallback. This
 * is the same vendor-neutral posture Rockets keeps for CRUD validation.
 *
 * ## Implementing for an adapter
 *
 * 1. Narrow `schema` to your supported schema type; throw with the
 *    entity `name` in the message otherwise.
 * 2. Produce a class whose NAME is `options.name` (use
 *    `Object.defineProperty(cls, 'name', ...)`) so key derivation and
 *    error messages match handwritten entities.
 * 3. Apply whatever metadata your store needs — for decorator-based
 *    ORMs apply the real decorators programmatically, e.g.
 *    `Column(options)(cls.prototype, key)`; for document stores a bare
 *    named class is usually enough.
 * 4. Map the schema-layer persistence semantics your adapter
 *    understands (primary key, generated values, uniqueness, indexes,
 *    relations) and ignore the rest explicitly.
 *
 * The TypeORM reference implementation is
 * `@bitwild/rockets-repository-typeorm/zod` (`typeOrmZodEntityCompiler`); the
 * DB-agnostic zod resource layer that consumes this contract is
 * `@bitwild/rockets-core/zod`.
 *
 * Wire it up by exposing the compiler on the adapter's
 * {@link RepositoryModuleInterface.entityCompiler} so schema layers can
 * resolve it from the same `repository` option that selects the
 * adapter.
 */
export interface SchemaEntityCompiler {
  compileEntity(
    schema: unknown,
    options: SchemaEntityCompilerOptions,
  ): Type<PlainLiteralObject>;
}
