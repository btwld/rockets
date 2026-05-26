// Public surface of the sample auth feature.
//
// `defineSampleAuth()` is the ONLY symbol Rockets consumers need to wire
// auth into `RocketsModule.forRoot({ auth: ... })`. It returns a
// self-contained `AuthFeatureBundle` carrying the adapter class, the
// auth controller, and the user entity registration in one shot.
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
export { defineSampleAuth } from './define-sample-auth';
