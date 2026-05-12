import type { RocketsUserMetadataConfig } from '../../domain/interfaces/rockets-user-metadata-config.interface';

/**
 * Runtime checks for `extras.userMetadata` before wiring repositories and Me DTOs.
 */
export function validateRocketsUserMetadataConfig(
  config: RocketsUserMetadataConfig,
): void {
  if (!config.entity || typeof config.entity !== 'function') {
    throw new Error(
      'RocketsUserMetadataConfig: `entity` must be a class constructor.',
    );
  }
  if (!config.createDto || typeof config.createDto !== 'function') {
    throw new Error(
      'RocketsUserMetadataConfig: `createDto` must be a class constructor.',
    );
  }
  if (!config.updateDto || typeof config.updateDto !== 'function') {
    throw new Error(
      'RocketsUserMetadataConfig: `updateDto` must be a class constructor.',
    );
  }
}
