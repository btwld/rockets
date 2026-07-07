import { ReferenceId } from '@concepta/nestjs-core';
import { RocketsAuthUserUpdatableInterface } from '../../../interfaces/rockets-auth-user-updatable.interface';
import { RepositoryContextInterface } from '@bitwild/rockets-core';

export class UpdateUserCommand {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly id: ReferenceId,
    public readonly dto: RocketsAuthUserUpdatableInterface,
  ) {}
}
