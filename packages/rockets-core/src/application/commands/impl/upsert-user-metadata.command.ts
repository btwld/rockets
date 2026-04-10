import { UserMetadataUpdatableInterface } from '../../../domain/interfaces/user-metadata.interface';

export class UpsertUserMetadataCommand {
  constructor(
    public readonly userId: string,
    public readonly data: UserMetadataUpdatableInterface,
  ) {}
}
