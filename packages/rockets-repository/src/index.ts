// Abstract repository layer only — adapters (TypeORM, Firestore) are app-level config
export * from '@concepta/nestjs-repository';

// Shadow upstream `InjectDynamicRepository` with a class-aware variant
// that accepts `string | Type<E>`. The string form remains identical to
// upstream; the class form derives the key via `deriveEntityKey()`.
export { InjectDynamicRepository } from './decorators/inject-dynamic-repository.decorator';
