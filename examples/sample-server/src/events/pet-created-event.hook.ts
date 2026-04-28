import { Injectable, PlainLiteralObject } from '@nestjs/common';
import { AfterCreate, RepoHook } from '@bitwild/rockets-repository';
import { EventBus } from '@nestjs/cqrs';
import { PetEntity } from '../resources/pet/pet.entity';
import { PetCreatedEvent } from './pet-created.event';

/**
 * Publishes a `PetCreatedEvent` after a Pet row commits.
 *
 * Replaces the previous `PetCreateHandler` whose only post-write
 * responsibility was firing this event. Living as an `@AfterCreate`
 * hook keeps event publication declarative and resource-local —
 * there is no separate handler/CQRS plumbing to register.
 */
@Injectable()
@RepoHook()
export class PetCreatedEventHook {
  constructor(private readonly eventBus: EventBus) {}

  @AfterCreate()
  async publish(
    result: PlainLiteralObject,
    _ctx?: PlainLiteralObject,
  ): Promise<PlainLiteralObject> {
    const pet = result as Partial<PetEntity>;
    if (pet?.id && pet?.userId) {
      this.eventBus.publish(
        new PetCreatedEvent(pet.id, pet.userId, pet.name ?? ''),
      );
    }
    return result;
  }
}
