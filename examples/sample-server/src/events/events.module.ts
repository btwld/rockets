import { Module } from '@nestjs/common';
import { FakeEmailGateway } from './email.gateway';
import { NotifyOnPetCreatedListener } from './notify-on-pet-created.listener';

@Module({
  providers: [FakeEmailGateway, NotifyOnPetCreatedListener],
  exports: [FakeEmailGateway],
})
export class EventsModule {}
