import { Injectable } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { RepositoryInterface, Where } from '@bitwild/rockets-repository';
import { UserEntity } from '../auth/user.entity';
import { FakeEmailGateway } from './email.gateway';
import { PetCreatedEvent } from './pet-created.event';
import { InjectDynamicRepository } from '@bitwild/rockets-common';

/**
 * Sends a "welcome" email to the pet's owner when a new pet is created.
 *
 * Listener behavior:
 *
 * - Read-only — never mutates the pet aggregate.
 * - Best-effort — an email failure here never rolls back the create
 *   transaction (it already committed). The alternative is a
 *   transactional-outbox pattern; out of scope for this sample.
 * - Idempotent-friendly — the gateway receives the `petId` so downstream
 *   dedupe (if wanted) is straightforward.
 */
@Injectable()
@EventsHandler(PetCreatedEvent)
export class NotifyOnPetCreatedListener
  implements IEventHandler<PetCreatedEvent>
{
  constructor(
    @InjectDynamicRepository(UserEntity)
    private readonly userRepo: RepositoryInterface<UserEntity>,
    private readonly email: FakeEmailGateway,
  ) {}

  async handle(event: PetCreatedEvent): Promise<void> {
    const owner = await this.userRepo.findOne({
      where: Where.eq<UserEntity>('id', event.ownerId),
    });
    if (!owner) return;

    await this.email.send({
      to: owner.email,
      subject: `Welcome ${event.petName}!`,
      body:
        `Hi ${owner.name ?? 'there'}, your pet ` +
        `"${event.petName}" (id ${event.petId}) has been registered.`,
    });
  }
}
