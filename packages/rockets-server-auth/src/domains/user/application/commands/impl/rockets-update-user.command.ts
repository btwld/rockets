import { UserEntityInterface } from '@concepta/nestjs-common';

export class RocketsUpdateUserCommand {
  constructor(
    public readonly id: string,
    public readonly data: Partial<UserEntityInterface>,
  ) {}
}
