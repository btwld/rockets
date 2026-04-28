import { Module } from '@nestjs/common';
import { FakeEmailGateway } from './email.gateway';
import { NotifyOnPetCreatedListener } from './notify-on-pet-created.listener';
import { PetCreatedEventHook } from './pet-created-event.hook';

@Module({
  providers: [FakeEmailGateway, NotifyOnPetCreatedListener, PetCreatedEventHook],
  exports: [FakeEmailGateway, PetCreatedEventHook],
})
export class EventsModule {}
