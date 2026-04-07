/**
 * Base userMetadata entity interface.
 * All userMetadata entities must implement this.
 * Clients can extend this with their own fields.
 */
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

export class BaseUserMetadataDto {
  userId?: string;
}

export class BaseUserMetadataCreateDto extends BaseUserMetadataDto {
  userId!: string;
}

export class BaseUserMetadataUpdateDto extends BaseUserMetadataDto {}
