import { Injectable } from '@nestjs/common';
import {
  RepositoryInterface,
  InjectDynamicRepository,
  Where,
} from '@concepta/nestjs-repository';
import { DeepPartial } from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataCreatableInterface } from '../../interfaces/rockets-auth-user-metadata-creatable.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../config/user-metadata.constants';
import {
  UserMetadataException,
  UserMetadataNotFoundException,
} from '../../domain/exceptions/user-metadata.exception';
import {
  RocketsAuthUserMetadataModelUpdatableInterface,
  RocketsAuthUserMetadataUpdatableInterface,
} from '../../interfaces/rockets-auth-user-metadata-updatable.interface';

/**
 * Generic User Metadata Model Service
 *
 * Provides adapter-agnostic operations for user metadata
 * including the key `createOrUpdate` method.
 *
 * Uses v8 RepositoryInterface with Where builder directly
 * (ModelService was removed in v8).
 *
 * TODO: Delete this class after migrating remaining injectors to SaveUserMetadataCommand /
 * UserMetadataRepository (duplicates the same persistence as SaveUserMetadataHandler).
 */
@Injectable()
export class GenericUserMetadataModelService {
  public readonly createDto: new () => RocketsAuthUserMetadataCreatableInterface;
  public readonly updateDto: new () => RocketsAuthUserMetadataModelUpdatableInterface;

  constructor(
    @InjectDynamicRepository(USER_METADATA_MODULE_ENTITY_KEY)
    public readonly repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
    createDto: new () => RocketsAuthUserMetadataCreatableInterface,
    updateDto: new () => RocketsAuthUserMetadataModelUpdatableInterface,
  ) {
    this.createDto = createDto;
    this.updateDto = updateDto;
  }

  /**
   * Find metadata by ID
   */
  async byId(
    id: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null> {
    return this.repo.findOne({
      where: Where.eq<RocketsAuthUserMetadataEntityInterface>('id', id),
    });
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
    return this.repo.findOne({
      where: Where.eq<RocketsAuthUserMetadataEntityInterface>('userId', userId),
    });
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
   */
  async createOrUpdate(
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const existingUserMetadata = await this.findByUserId(userId);

    if (existingUserMetadata) {
      const definedData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );
      const updateData: RocketsAuthUserMetadataModelUpdatableInterface = {
        ...existingUserMetadata,
        ...definedData,
      };
      return this.update(updateData);
    }

    const createData: RocketsAuthUserMetadataCreatableInterface = {
      ...data,
      userId,
    };
    return this.create(createData);
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
   * Create metadata
   */
  async create(
    data: RocketsAuthUserMetadataCreatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    return this.repo.create(
      data as DeepPartial<RocketsAuthUserMetadataEntityInterface>,
    );
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
    const existing = await this.repo.findOne({
      where: Where.eq<RocketsAuthUserMetadataEntityInterface>('id', id),
    });
    if (!existing) {
      throw new UserMetadataNotFoundException();
    }
    return this.repo.update(
      existing,
      data as DeepPartial<RocketsAuthUserMetadataEntityInterface>,
    );
  }
}
