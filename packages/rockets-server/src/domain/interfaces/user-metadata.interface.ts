// Re-export from rockets-core — this package defers all user-metadata
// definitions to core. Kept here for the local import path used by tests
// and fixtures.
export type {
  BaseUserMetadataEntityInterface,
  UserMetadataEntityInterface,
  UserMetadataCreatableInterface,
  UserMetadataUpdatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';

export {
  BaseUserMetadataDto,
  BaseUserMetadataCreateDto,
  BaseUserMetadataUpdateDto,
} from '@bitwild/rockets-core';
