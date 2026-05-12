import { defineModuleResource } from '@bitwild/rockets-core';
import { PetShareEntity } from './pet-share.entity';
import { PetShareController } from './pet-share.controller';
import { PetShareService } from './pet-share.service';
import { PetOwnerOrSharedHook } from './pet-owner-or-shared.hook';

/**
 * Pet-share feature: registers the `PetShareEntity` repository and wires
 * the controller/service/hook that own the share workflow.
 *
 * Replaces the old `PetShareModule` + `repositories.entities` entry pair
 * with a single colocated bundle consumed via `RocketsModule.resources`.
 */
export const petShareFeature = defineModuleResource({
  entities: [PetShareEntity],
  controllers: [PetShareController],
  providers: [PetShareService, PetOwnerOrSharedHook],
  exports: [PetShareService, PetOwnerOrSharedHook],
});
