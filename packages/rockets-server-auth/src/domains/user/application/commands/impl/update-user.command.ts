import { RepositoryContextInterface } from '@bitwild/rockets-app';
import { ReferenceId } from '@bitwild/rockets-app';
import { RocketsAuthUserUpdatableInterface } from '../../../interfaces/rockets-auth-user-updatable.interface';

export class UpdateUserCommand {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly id: ReferenceId,
    public readonly dto: RocketsAuthUserUpdatableInterface,
  ) {}
}
