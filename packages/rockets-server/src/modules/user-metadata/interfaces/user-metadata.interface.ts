/**
 * Base userMetadata entity interface
 * This is the minimal interface that all userMetadata entities must implement
 * Clients can extend this with their own fields
 */
export interface BaseUserMetadataEntityInterface {
  id: string;
  userId: string;
  dateCreated: Date;
  dateUpdated: Date;
  dateDeleted: Date | null;
  version: number;
}

/**
 * Generic userMetadata entity interface
 * This is a generic interface that can be extended by clients
 */
export interface UserMetadataEntityInterface
  extends BaseUserMetadataEntityInterface {}

/**
 * Generic userMetadata creatable interface
 * Used for creating new userMetadata with custom data
 */
export interface UserMetadataCreatableInterface {
  userId: string;
}

/**
 * Generic userMetadata updatable interface (for API)
 * Used for updating existing userMetadata with custom data
 */
export interface UserMetadataUpdatableInterface {}

/**
 * Generic userMetadata model updatable interface (for model service)
 * Includes ID for model service operations
 */
export interface UserMetadataModelUpdatableInterface
  extends UserMetadataUpdatableInterface {
  id: string;
}

/**
 * Generic userMetadata model service interface
 * Defines the contract for userMetadata model services
 * Follows SDK patterns for service interfaces
 */
export interface UserMetadataModelServiceInterface {
  /**
   * Find userMetadata by user ID
   */
  findByUserId(userId: string): Promise<UserMetadataEntityInterface | null>;

  /**
   * Create or update userMetadata for a user
   * Main method used by controllers
   */
  createOrUpdate(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<UserMetadataEntityInterface>;

  /**
   * Get userMetadata by user ID with proper error handling
   */
  getUserMetadataByUserId(userId: string): Promise<UserMetadataEntityInterface>;

  /**
   * Get userMetadata by ID with proper error handling
   */
  getUserMetadataById(id: string): Promise<UserMetadataEntityInterface>;

  /**
   * Update userMetadata data
   */
  updateUserMetadata(
    userId: string,
    userMetadataData: UserMetadataUpdatableInterface,
  ): Promise<UserMetadataEntityInterface>;
}

/**
 * Generic DTO class for userMetadata operations
 * This can be extended by clients with their own validation rules
 */
export class BaseUserMetadataDto {
  userId?: string;
}

/**
 * Generic create DTO class
 * This can be extended by clients with their own validation rules
 */
export class BaseUserMetadataCreateDto extends BaseUserMetadataDto {
  userId!: string;
}

/**
 * Generic update DTO class
 * This can be extended by clients with their own validation rules
 */
export class BaseUserMetadataUpdateDto extends BaseUserMetadataDto {
  // Only userMetadata can be updated, userId is immutable
}
