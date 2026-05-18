import { UserEntityInterface } from '@concepta/nestjs-user';

export class RocketsUpdateUserCommand {
  constructor(
    public readonly id: string,
    public readonly data: Partial<UserEntityInterface>,
  ) {}
}
