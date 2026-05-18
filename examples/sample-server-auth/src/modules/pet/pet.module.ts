import { Module } from '@nestjs/common';

/**
 * Pet feature wrapper.
 *
 * `PetModelService` and `JwtAuthenticatedUserLocal` are declared on the
 * pet resource bundle in `pet.resource.ts → providers: [...]` because they
 * inject `@InjectDynamicRepository(PetEntity)` and need to share the same
 * module scope as the dynamic-repository registration produced by
 * `defineResource({ entity: PetEntity })`.
 *
 * `PetAccessQueryService` is registered by `AccessControlModule` itself —
 * the v7 access-control module adds every entry of
 * `accessControl.queryServices: [...]` to its own provider list, and
 * `AccessControlGuard` resolves it via strict `moduleRef.resolve()`
 * against that same scope.
 *
 * Kept as an empty placeholder so existing `imports: [PetModule]` entries
 * (`app.module.ts`, `accessControl.imports`) keep type-checking.
 */
@Module({})
export class PetModule {}
