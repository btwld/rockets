import { Injectable, Inject } from '@nestjs/common';
import { RepositoryInterface, ModelService } from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataCreateDtoInterface } from '../interfaces/rockets-auth-user-metadata-dto.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../constants/user-metadata.constants';
import {
  UserMetadataException,
  UserMetadataNotFoundException,
} from '../user-metadata.exception';

/**
 * Generic User Metadata Model Service
 *
 * Provides adapter-agnostic operations for user metadata
 * including the key `createOrUpdate` method.
 *
 * Follows the same pattern as rockets-server's GenericUserMetadataModelService
 * by extending ModelService.
 */
@Injectable()
export class GenericUserMetadataModelService extends ModelService<
  RocketsAuthUserMetadataEntityInterface,
  RocketsAuthUserMetadataCreateDtoInterface,
  RocketsAuthUserMetadataEntityInterface
> {
  public readonly createDto: new () => RocketsAuthUserMetadataCreateDtoInterface;
  public readonly updateDto: new () => RocketsAuthUserMetadataEntityInterface;

  constructor(
    @Inject(USER_METADATA_MODULE_ENTITY_KEY)
    public readonly repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
    createDto: new () => RocketsAuthUserMetadataCreateDtoInterface,
    updateDto: new () => RocketsAuthUserMetadataEntityInterface,
  ) {
    super(repo);
    this.createDto = createDto;
    this.updateDto = updateDto;
  }

  /**
   * Override validate to skip validation for dynamic metadata
   * The metadata structure can vary per implementation
   */
  protected async validate<T>(_type: new () => T, data: T): Promise<T> {
    // Skip validation for user metadata as it can have dynamic fields
    // Each implementation defines their own metadata structure
    return Promise.resolve(data);
  }

  /**
   * Get metadata by ID (throws if not found)
   */
  async getUserMetadataById(
    id: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const userMetadata = await this.byId(id);
    if (!userMetadata) {
      throw new UserMetadataNotFoundException();
    }
    return userMetadata;
  }

  /**
   * Update user metadata
   */
  async updateUserMetadata(
    userId: string,
    userMetadataData: Partial<RocketsAuthUserMetadataEntityInterface>,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const userMetadata = await this.getUserMetadataByUserId(userId);
    return this.update({
      ...userMetadata,
      ...userMetadataData,
    });
  }

  /**
   * Find metadata by user ID
   */
  async findByUserId(
    userId: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null> {
    return this.repo.findOne({ where: { userId } });
  }

  /**
   * Check if user has metadata
   */
  async hasUserMetadata(userId: string): Promise<boolean> {
    const userMetadata = await this.findByUserId(userId);
    return !!userMetadata;
  }

  /**
   * Create or update user metadata
   *
   * This is the key adapter-agnostic method that handles both
   * creation and updates in a single call
   */
  async createOrUpdate(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const existingUserMetadata = await this.findByUserId(userId);

    if (existingUserMetadata) {
      // Update existing userMetadata with new data
      const updateData = { ...existingUserMetadata, ...data };
      return this.update(updateData);
    } else {
      // Create new userMetadata with user ID and userMetadata data
      const createData = { userId, ...data };
      return this.create(createData);
    }
  }

  /**
   * Get metadata by user ID (throws if not found)
   */
  async getUserMetadataByUserId(
    userId: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const userMetadata = await this.findByUserId(userId);
    if (!userMetadata) {
      throw new UserMetadataNotFoundException();
    }
    return userMetadata;
  }

  /**
   * Update metadata by ID
   */
  async update(
    data: RocketsAuthUserMetadataEntityInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const { id } = data;
    if (!id) {
      throw new UserMetadataException('ID is required for update operation');
    }
    // Get existing entity and merge with update data
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) {
      throw new UserMetadataNotFoundException();
    }
    return super.update(data);
  }
}
