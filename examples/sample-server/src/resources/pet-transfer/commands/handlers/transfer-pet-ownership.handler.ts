import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  TransactionScope,
  Where,
} from '@bitwild/rockets-repository';
import { PetEntity } from '../../../pet/pet.schema';
import type { Pet } from '../../../pet/pet.schema';
import { PetShareEntity } from '../../../pet-share/pet-share.entity';
import { UserEntity } from '../../../../auth/user.entity';
import { TransferPetOwnershipCommand } from '../impl/transfer-pet-ownership.command';
import { PetTransferredEvent } from '../../events/pet-transferred.event';

/**
 * CQRS handler for pet ownership transfer.
 *
 * This module exists alongside the plain-service `PetShareService` to
 * demonstrate both persistence patterns — see `docs/PATTERNS.md` style
 * comment in `pet-transfer/README-PATTERNS.md` if/when it's written.
 *
 * Atomic steps inside one transaction:
 *
 * 1. Reload pet with current owner lock (read-then-modify).
 * 2. Validate the `currentOwnerId` in the command still matches the DB
 *    (TOCTOU guard — ownership could have changed between HTTP request
 *    and this line).
 * 3. Reassign `pet.userId` to the new owner.
 * 4. Revoke every `PetShare` row pointing at the pet — shares are an
 *    artifact of the previous owner's access grants, not part of the
 *    pet aggregate.
 *
 * The `PetTransferredEvent` is published *after* the txScope resolves
 * so listeners (audit, email) never observe a rolled-back transfer.
 */
@Injectable()
@CommandHandler(TransferPetOwnershipCommand)
export class TransferPetOwnershipHandler
  implements ICommandHandler<TransferPetOwnershipCommand, Pet>
{
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly petRepo: RepositoryInterface<Pet>,
    @InjectDynamicRepository(PetShareEntity)
    private readonly shareRepo: RepositoryInterface<PetShareEntity>,
    @InjectDynamicRepository(UserEntity)
    private readonly userRepo: RepositoryInterface<UserEntity>,
    private readonly txScope: TransactionScope,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: TransferPetOwnershipCommand): Promise<Pet> {
    const { ctx, petId, currentOwnerId, newOwnerId } = command;

    if (currentOwnerId === newOwnerId) {
      throw new BadRequestException('Cannot transfer a pet to its own owner');
    }

    const { result, revokedCount } = await this.txScope.run(ctx, async () => {
      const pet = await this.petRepo.findOne({
        where: Where.eq<Pet>('id', petId),
        ctx,
      });
      if (!pet) throw new NotFoundException(`Pet ${petId} not found`);
      if (pet.userId !== currentOwnerId) {
        // 404 instead of 403 to avoid leaking existence to a stranger
        // that guessed the id.
        throw new NotFoundException(`Pet ${petId} not found`);
      }

      const newOwner = await this.userRepo.findOne({
        where: Where.eq<UserEntity>('id', newOwnerId),
        ctx,
      });
      if (!newOwner) {
        throw new NotFoundException(`User ${newOwnerId} not found`);
      }

      const updated = await this.petRepo.update(
        pet,
        { userId: newOwnerId },
        { ctx },
      );

      const shares = await this.shareRepo.find({
        where: Where.eq<PetShareEntity>('petId', petId),
        ctx,
      });
      for (const share of shares) {
        await this.shareRepo.delete(share, { ctx });
      }

      return { result: updated, revokedCount: shares.length };
    });

    this.eventBus.publish(
      new PetTransferredEvent(petId, currentOwnerId, newOwnerId, revokedCount),
    );

    return result;
  }
}
