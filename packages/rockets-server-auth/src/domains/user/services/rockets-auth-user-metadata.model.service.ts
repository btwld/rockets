import { Injectable } from '@nestjs/common';
import {
  RepositoryInterface,
  ModelService,
  InjectDynamicRepository,
} from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataCreatableInterface } from '../interfaces/rockets-auth-user-metadata-creatable.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../constants/user-metadata.constants';
import {
  UserMetadataException,
  UserMetadataNotFoundException,
} from '../user-metadata.exception';
import {
  RocketsAuthUserMetadataModelUpdatableInterface,
  RocketsAuthUserMetadataUpdatableInterface,
} from '../interfaces/rockets-auth-user-metadata-updatable.interface';

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
  RocketsAuthUserMetadataCreatableInterface,
  RocketsAuthUserMetadataModelUpdatableInterface
> {
  public readonly createDto: new () => RocketsAuthUserMetadataCreatableInterface;
  public readonly updateDto: new () => RocketsAuthUserMetadataModelUpdatableInterface;

  constructor(
    @InjectDynamicRepository(USER_METADATA_MODULE_ENTITY_KEY)
    public readonly repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
    createDto: new () => RocketsAuthUserMetadataCreatableInterface,
    updateDto: new () => RocketsAuthUserMetadataModelUpdatableInterface,
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
    userMetadataData: Partial<RocketsAuthUserMetadataUpdatableInterface>,
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
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const existingUserMetadata = await this.findByUserId(userId);

    if (existingUserMetadata) {
      // Update existing userMetadata with new data
      // Filter out undefined values from data to prevent overriding existing values
      // (class instances from class-transformer may include undefined properties)
      const definedData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );
      const plainExisting = JSON.parse(JSON.stringify(existingUserMetadata));
      const updateData: RocketsAuthUserMetadataModelUpdatableInterface = {
        ...plainExisting,
        ...definedData,
      };
      return this.update(updateData);
    } else {
      // Create new userMetadata with user ID and userMetadata data
      const createData: RocketsAuthUserMetadataCreatableInterface = {
        ...data,
        userId,
      };
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
    data: RocketsAuthUserMetadataModelUpdatableInterface,
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
