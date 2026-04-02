import { IEvent } from '@nestjs/cqrs';

export class UserSignedUpEvent implements IEvent {
  constructor(public readonly userId: string) {}
}
