import { UserEntityInterface } from '@concepta/nestjs-common';

export class RocketsCreateUserCommand {
  constructor(public readonly data: Partial<UserEntityInterface>) {}
}
