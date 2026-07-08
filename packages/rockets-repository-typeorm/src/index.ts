// Thin wrapper over the upstream TypeORM implementation of the dynamic
// repository contract. Re-exports everything from
// `@concepta/nestjs-repository-typeorm` so consumers depend on a single
// `@bitwild/*` package. The Rockets-specific addition — the zod
// `SchemaEntityCompiler` — lives at the `/zod` subpath, not here.
export * from '@concepta/nestjs-repository-typeorm';
