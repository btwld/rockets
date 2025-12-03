/**
 * DTO interface for user metadata creation
 */

/**
 * Updatable DTO interface for user metadata - omits 'id' and 'userId'
 */
export interface RocketsAuthUserMetadataUpdatableInterface {}

export interface RocketsAuthUserMetadataModelUpdatableInterface
  extends RocketsAuthUserMetadataUpdatableInterface {
  id: string;
}
