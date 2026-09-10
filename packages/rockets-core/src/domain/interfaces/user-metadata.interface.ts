export interface BaseUserMetadataEntityInterface {
  id: string;
  userId: string;
  dateCreated: Date;
  dateUpdated: Date;
  dateDeleted: Date | null;
  version: number;
}

export interface UserMetadataEntityInterface
  extends BaseUserMetadataEntityInterface {}

export interface UserMetadataCreatableInterface {
  userId: string;
}

export interface UserMetadataUpdatableInterface {}

export interface UserMetadataModelUpdatableInterface
  extends UserMetadataUpdatableInterface {
  id: string;
}
