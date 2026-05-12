import { defineModuleResource } from '@bitwild/rockets-core';
import { FakeEmailGateway } from './email.gateway';
import { NotifyOnPetCreatedListener } from './notify-on-pet-created.listener';
import { PetCreatedEventHook } from './pet-created-event.hook';

/**
 * Domain-events feature: a CQRS listener turns `PetCreatedEvent`
 * into a welcome email; an `EntityHook` publishes the event from
 * `PetEntity.afterCreate`.
 *
 * `PetCreatedEventHook` is exported because `pet.resource.ts`
 * registers it on `PetEntity`. `FakeEmailGateway` is exported so the
 * e2e suite can call `app.get(FakeEmailGateway).reset()`.
 * `NotifyOnPetCreatedListener` stays internal — `@nestjs/cqrs`
 * auto-discovers it through the bundle's providers.
 */
export const eventsFeature = defineModuleResource({
  providers: [
    FakeEmailGateway,
    NotifyOnPetCreatedListener,
    PetCreatedEventHook,
  ],
  exports: [FakeEmailGateway, PetCreatedEventHook],
});
