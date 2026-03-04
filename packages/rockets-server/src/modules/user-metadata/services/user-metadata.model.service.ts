import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  RepositoryInterface,
  ModelService,
  InjectDynamicRepository,
  RuntimeException,
} from '@concepta/nestjs-common';
import { logAndGetErrorDetails } from '../../../utils/error-logging.helper';
import {
  UserMetadataEntityInterface,
  UserMetadataCreatableInterface,
  UserMetadataUpdatableInterface,
  UserMetadataModelUpdatableInterface,
  UserMetadataModelServiceInterface,
} from '../interfaces/user-metadata.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../constants/user-metadata.constants';

@Injectable()
export class GenericUserMetadataModelService
  extends ModelService<
    UserMetadataEntityInterface,
    UserMetadataCreatableInterface,
    UserMetadataModelUpdatableInterface
  >
  implements UserMetadataModelServiceInterface
{
  private readonly logger = new Logger(GenericUserMetadataModelService.name);
  public readonly createDto: new () => UserMetadataCreatableInterface;
  public readonly updateDto: new () => UserMetadataModelUpdatableInterface;

  constructor(
    @InjectDynamicRepository(USER_METADATA_MODULE_ENTITY_KEY)
    public readonly repo: RepositoryInterface<UserMetadataEntityInterface>,
    createDto: new () => UserMetadataCreatableInterface,
    updateDto: new () => UserMetadataModelUpdatableInterface,
  ) {
    super(repo);
    this.createDto = createDto;
    this.updateDto = updateDto;
  }

  async getUserMetadataById(id: string): Promise<UserMetadataEntityInterface> {
    try {
      const userMetadata = await this.byId(id);
      if (!userMetadata) {
        throw new NotFoundException(`UserMetadata with ID ${id} not found`);
      }
      return userMetadata;
    } catch (error) {
      this.rethrowKnownOrLog(error, 'Failed to fetch user metadata', {
        id,
        errorId: 'USER_METADATA_FETCH_FAILED',
      });
    }
  }

  async updateUserMetadata(
    userId: string,
    userMetadataData: UserMetadataUpdatableInterface,
  ): Promise<UserMetadataEntityInterface> {
    const userMetadata = await this.findByUserId(userId);
    if (!userMetadata) {
      throw new NotFoundException(
        `UserMetadata for user ID ${userId} not found`,
      );
    }
    return this.update({
      ...userMetadata,
      ...userMetadataData,
    });
  }

  async findByUserId(
    userId: string,
  ): Promise<UserMetadataEntityInterface | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async hasUserMetadata(userId: string): Promise<boolean> {
    const userMetadata = await this.findByUserId(userId);
    return !!userMetadata;
  }

  async createOrUpdate(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<UserMetadataEntityInterface> {
    const existing = await this.findByUserId(userId);

    if (existing) {
      return this.update({ id: existing.id, ...data });
    }

    return this.create({ userId, ...data });
  }

  async getUserMetadataByUserId(
    userId: string,
  ): Promise<UserMetadataEntityInterface | null> {
    try {
      return await this.findByUserId(userId);
    } catch (error) {
      this.rethrowKnownOrLog(error, 'Failed to fetch user metadata', {
        userId,
        errorId: 'USER_METADATA_FETCH_BY_USER_FAILED',
      });
    }
  }

  async update(
    data: UserMetadataModelUpdatableInterface,
  ): Promise<UserMetadataEntityInterface> {
    const { id } = data;
    if (!id) {
      throw new BadRequestException('ID is required for update operation');
    }
    try {
      const existing = await this.repo.findOne({ where: { id } });
      if (!existing) {
        throw new NotFoundException(`UserMetadata with ID ${id} not found`);
      }
      return super.update(data);
    } catch (error) {
      this.rethrowKnownOrLog(error, 'Failed to update user metadata', {
        id,
        errorId: 'USER_METADATA_UPDATE_FAILED',
      });
    }
  }

  /**
   * Re-throw known exceptions (RuntimeException, HttpException) as-is.
   * For unknown errors, log details and throw InternalServerErrorException.
   */
  private rethrowKnownOrLog(
    error: unknown,
    message: string,
    context: Record<string, unknown>,
  ): never {
    if (error instanceof RuntimeException || error instanceof HttpException) {
      throw error;
    }
    logAndGetErrorDetails(error, this.logger, message, context);
    throw new InternalServerErrorException(message);
  }
}
