import { UserEntityInterface } from '@concepta/nestjs-user';

export class RocketsCreateUserCommand {
  constructor(public readonly data: Partial<UserEntityInterface>) {}
}
