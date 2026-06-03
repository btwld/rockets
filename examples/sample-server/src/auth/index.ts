// Public surface of the sample auth feature.
//
// `defineSampleAuth()` wires auth into `RocketsModule.forRoot({ auth })`.
// It returns an `AuthBootstrap` (`adapter` + `forRoot()` for controller wiring).
// Pair it with `sampleAuthUserResource` on `resources[]` for the user entity row.
//
// `SampleAuthAdapter` and `AuthController` stay internal to this folder
// — nothing outside the auth feature should inject the adapter class
// directly. Code that needs the authenticated user uses the `@AuthUser()`
// decorator or resolves it from `AUTH_ADAPTERS_TOKEN` via core.
//
// `UserEntity` / `UserRole` remain exported as shared domain types: the
// pet-transfer handler, the event listeners, and the admin guard all
// hold a dynamic-repo handle to `UserEntity` and read `UserRole` values.
export { UserEntity, UserRole } from './user.entity';
export { defineSampleAuth, sampleAuthUserResource } from './define-sample-auth';
