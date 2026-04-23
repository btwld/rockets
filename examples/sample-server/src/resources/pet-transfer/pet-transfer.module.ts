import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PetTransferController } from './pet-transfer.controller';
import { TransferPetOwnershipHandler } from './commands/handlers/transfer-pet-ownership.handler';

@Module({
  imports: [CqrsModule],
  controllers: [PetTransferController],
  providers: [TransferPetOwnershipHandler],
})
export class PetTransferModule {}
