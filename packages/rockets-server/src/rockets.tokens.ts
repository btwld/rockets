import type { RocketsUserMetadataConfig } from '@bitwild/rockets-core';

export const RAW_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_SERVER_MODULE_RAW_OPTIONS_TOKEN__',
);

/**
 * Narrow config consumed by `MeController`.
 *
 * Keep the controller on the minimal surface it actually needs instead
 * of injecting the full `RocketsUserMetadataConfig` (which also carries
 * persistence wiring such as `entity` and `repository`).
 */
export type RocketsUserMetadataDtoConfig = Pick<
  RocketsUserMetadataConfig,
  'updateDto'
>;

export const ROCKETS_USER_METADATA_DTO_TOKEN = Symbol(
  '__ROCKETS_SERVER_MODULE_USER_METADATA_DTO_TOKEN__',
);
