import { ReferenceId } from '@bitwild/rockets-app';
import { RocketsAuthUserUpdatableInterface } from '../../../interfaces/rockets-auth-user-updatable.interface';
import { RepositoryContextInterface } from '@bitwild/rockets-common';

export class UpdateUserCommand {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly id: ReferenceId,
    public readonly dto: RocketsAuthUserUpdatableInterface,
  ) {}
}
