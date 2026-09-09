// Re-exported rather than reimplemented: upstream owns both the metadata key
// and the `true` / `'classLevel'` sentinel, and `AuthServerGuard` reads them
// back through upstream's own `isAuthPublic()`. Owning a copy of either here
// only creates a way for the two to drift. Consumers keep single-sourcing
// from `@concepta/rockets-core`.
export {
  AuthPublic,
  type AuthPublicMetadata,
  type AuthPublicOptions,
} from '@concepta/nestjs-authentication';
