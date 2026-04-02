import { ReferenceId } from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../../interfaces/rockets-auth-user-metadata-updatable.interface';

export class SaveUserMetadataCommand {
  constructor(
    public readonly userId: ReferenceId,
    public readonly data: RocketsAuthUserMetadataUpdatableInterface,
  ) {}
}
