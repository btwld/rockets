import { Injectable } from '@nestjs/common';
import { EntityHook, PassthroughEntityHookBase } from '@bitwild/rockets-core';
import { EventBus } from '@nestjs/cqrs';
import { PetEntity } from '../resources/pet/pet.entity';
import { PetCreatedEvent } from './pet-created.event';

/**
 * Publishes a `PetCreatedEvent` after a Pet row commits.
 *
 * Replaces the previous `PetCreateHandler` whose only post-write
 * responsibility was firing this event. Living as an `afterCreate`
 * hook keeps event publication declarative and resource-local —
 * there is no separate handler/CQRS plumbing to register.
 */
@EntityHook({ entity: PetEntity })
@Injectable()
export class PetCreatedEventHook extends PassthroughEntityHookBase<PetEntity> {
  constructor(private readonly eventBus: EventBus) {
    super();
  }

  override async afterCreate(result: PetEntity): Promise<PetEntity> {
    if (result?.id && result?.userId) {
      this.eventBus.publish(
        new PetCreatedEvent(result.id, result.userId, result.name ?? ''),
      );
    }
    return result;
  }
}
