import { CqrsModule } from '@nestjs/cqrs';
import { defineModuleResource } from '@bitwild/rockets-core';
import { PetTransferController } from './pet-transfer.controller';
import { TransferPetOwnershipHandler } from './commands/handlers/transfer-pet-ownership.handler';

/**
 * Pet-transfer is a CQRS-only workflow: it consumes the pet repository
 * already registered by `petResource` and emits a domain command — no new
 * tables. This bundle is `entities: []` to make the "I don't own any
 * persistence" intent explicit.
 */
export const petTransferFeature = defineModuleResource({
  imports: [CqrsModule],
  controllers: [PetTransferController],
  providers: [TransferPetOwnershipHandler],
});
