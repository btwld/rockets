import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { RepositoryInterface } from '@concepta/nestjs-repository';
import { RuntimeException } from '@concepta/nestjs-common';
import { GenericUserMetadataModelService } from './user-metadata.model.service';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../constants/user-metadata.constants';
import {
  UserMetadataEntityInterface,
  UserMetadataModelUpdatableInterface,
} from '../interfaces/user-metadata.interface';
import { logAndGetErrorDetails } from '../../../utils/error-logging.helper';

jest.mock('../../../utils/error-logging.helper', () => ({
  logAndGetErrorDetails: jest.fn(),
}));

describe('GenericUserMetadataModelService - Exception Mapping', () => {
  let service: GenericUserMetadataModelService;
  let mockRepository: jest.Mocked<
    RepositoryInterface<UserMetadataEntityInterface>
  >;

  const createDto = class {
    userId!: string;
  };

  const updateDto = class {
    id!: string;
  };

  beforeEach(() => {
    mockRepository = {
      entityName: 'UserMetadata',
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      find: jest.fn(),
      merge: jest.fn(),
      gt: jest.fn(),
      gte: jest.fn(),
      lt: jest.fn(),
      lte: jest.fn(),
    } as unknown as jest.Mocked<
      RepositoryInterface<UserMetadataEntityInterface>
    >;

    service = new GenericUserMetadataModelService(
      mockRepository,
      createDto,
      updateDto,
    );
    jest.clearAllMocks();
  });

  it('rethrows NotFoundException from getUserMetadataById', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    await expect(service.getUserMetadataById('missing-id')).rejects.toThrow(
      NotFoundException,
    );
    expect(logAndGetErrorDetails).not.toHaveBeenCalled();
  });

  it('maps unexpected errors to InternalServerErrorException in getUserMetadataById', async () => {
    mockRepository.findOne.mockRejectedValue(new Error('db failed'));

    await expect(service.getUserMetadataById('broken-id')).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(logAndGetErrorDetails).toHaveBeenCalledTimes(1);
  });

  it('returns null from getUserMetadataByUserId when user not found', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    const result = await service.getUserMetadataByUserId('missing-user');
    expect(result).toBeNull();
    expect(logAndGetErrorDetails).not.toHaveBeenCalled();
  });

  it('maps unexpected errors to InternalServerErrorException in getUserMetadataByUserId', async () => {
    mockRepository.findOne.mockRejectedValue(new Error('query failed'));

    await expect(
      service.getUserMetadataByUserId('broken-user'),
    ).rejects.toThrow(InternalServerErrorException);
    expect(logAndGetErrorDetails).toHaveBeenCalledTimes(1);
  });

  it('rethrows NotFoundException from update when target record does not exist', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    await expect(service.update({ id: 'missing-id' })).rejects.toThrow(
      NotFoundException,
    );
    expect(logAndGetErrorDetails).not.toHaveBeenCalled();
  });

  it('maps unexpected errors to InternalServerErrorException in update', async () => {
    mockRepository.findOne.mockRejectedValue(new Error('read failed'));

    await expect(service.update({ id: 'broken-id' })).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(logAndGetErrorDetails).toHaveBeenCalledTimes(1);
  });
});

describe('GenericUserMetadataModelService', () => {
  let service: GenericUserMetadataModelService;
  let mockRepository: jest.Mocked<
    RepositoryInterface<UserMetadataEntityInterface>
  >;

  const mockUserMetadata = {
    id: 'metadata-123',
    userId: 'user-123',
    firstName: 'John',
    lastName: 'Doe',
    dateCreated: new Date(),
    dateUpdated: new Date(),
    dateDeleted: null,
    version: 1,
  };

  const mockCreateDto = class {
    userId!: string;
    firstName?: string;
    lastName?: string;
  };

  const mockUpdateDto = class {
    id!: string;
    firstName?: string;
    lastName?: string;
  };

  beforeEach(async () => {
    mockRepository = {
      entityName: jest.fn().mockReturnValue('UserMetadata'),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      find: jest.fn(),
      merge: jest.fn(),
      gt: jest.fn(),
      gte: jest.fn(),
      lt: jest.fn(),
      lte: jest.fn(),
    } as unknown as jest.Mocked<
      RepositoryInterface<UserMetadataEntityInterface>
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: GenericUserMetadataModelService,
          useFactory: () =>
            new GenericUserMetadataModelService(
              mockRepository,
              mockCreateDto,
              mockUpdateDto,
            ),
        },
        {
          provide: USER_METADATA_MODULE_ENTITY_KEY,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<GenericUserMetadataModelService>(
      GenericUserMetadataModelService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserMetadataById', () => {
    it('should return user metadata when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);

      const result = await service.getUserMetadataById('metadata-123');

      expect(result).toEqual(mockUserMetadata);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { field: 'id', operator: 'eq', value: 'metadata-123' },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserMetadataById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should rethrow RuntimeException', async () => {
      mockRepository.findOne.mockRejectedValue(
        new RuntimeException('runtime error'),
      );

      await expect(service.getUserMetadataById('metadata-123')).rejects.toThrow(
        RuntimeException,
      );
    });

    it('should throw InternalServerErrorException on unexpected error', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('db error'));

      await expect(service.getUserMetadataById('metadata-123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findByUserId', () => {
    it('should return user metadata for existing user', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);

      // Act
      const result = await service.findByUserId('user-123');

      // Assert
      expect(result).toEqual(mockUserMetadata);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { field: 'userId', operator: 'eq', value: 'user-123' },
      });
    });

    it('should return null for non-existent user', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.findByUserId('non-existent');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('hasUserMetadata', () => {
    it('should return true when user has metadata', async () => {
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);

      const result = await service.hasUserMetadata('user-123');

      expect(result).toBe(true);
    });

    it('should return false when user has no metadata', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.hasUserMetadata('user-123');

      expect(result).toBe(false);
    });
  });

  describe('updateUserMetadata', () => {
    it('should update existing user metadata', async () => {
      const updateData = { firstName: 'Updated' };
      const updated = { ...mockUserMetadata, ...updateData };
      mockRepository.findOne
        .mockResolvedValueOnce(mockUserMetadata)
        .mockResolvedValueOnce(mockUserMetadata);
      mockRepository.update.mockResolvedValue(updated);

      const result = await service.updateUserMetadata('user-123', updateData);

      expect(mockRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { field: 'userId', operator: 'eq', value: 'user-123' },
      });
      expect(mockRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { field: 'id', operator: 'eq', value: 'metadata-123' },
      });
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockUserMetadata,
        expect.objectContaining(updateData),
      );
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when user metadata not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateUserMetadata('non-existent', { firstName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createOrUpdate', () => {
    const newData = { firstName: 'Jane', lastName: 'Smith' };

    it('should create new metadata when none exists', async () => {
      const created = { ...mockUserMetadata, ...newData };
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue(created);

      const result = await service.createOrUpdate('user-123', newData);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { field: 'userId', operator: 'eq', value: 'user-123' },
      });
      expect(mockRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        ...newData,
      });
      expect(result).toEqual(created);
    });

    it('should update existing metadata when it exists', async () => {
      const merged = { ...mockUserMetadata, ...newData };
      mockRepository.findOne
        .mockResolvedValueOnce(mockUserMetadata)
        .mockResolvedValueOnce(mockUserMetadata);
      mockRepository.update.mockResolvedValue(merged);

      const result = await service.createOrUpdate('user-123', newData);

      expect(mockRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { field: 'userId', operator: 'eq', value: 'user-123' },
      });
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockUserMetadata,
        expect.objectContaining({ id: 'metadata-123', ...newData }),
      );
      expect(result).toEqual(merged);
    });
  });

  describe('getUserMetadataByUserId', () => {
    it('should return metadata when user exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);

      const result = await service.getUserMetadataByUserId('user-123');

      expect(result).toEqual(mockUserMetadata);
    });

    it('should return null when user has no metadata', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getUserMetadataByUserId('non-existent');

      expect(result).toBeNull();
    });

    it('should rethrow RuntimeException', async () => {
      mockRepository.findOne.mockRejectedValue(
        new RuntimeException('runtime error'),
      );

      await expect(service.getUserMetadataByUserId('user-123')).rejects.toThrow(
        RuntimeException,
      );
    });

    it('should throw InternalServerErrorException on unexpected error', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('db error'));

      await expect(service.getUserMetadataByUserId('user-123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('update', () => {
    it('should update metadata successfully', async () => {
      // Arrange
      const updateData = { ...mockUserMetadata, firstName: 'Updated' };
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);
      mockRepository.update.mockResolvedValue(updateData);

      // Act
      const result = await service.update(updateData);

      // Assert
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { field: 'id', operator: 'eq', value: 'metadata-123' },
      });
      expect(result).toEqual(updateData);
    });

    it('should throw BadRequestException when ID is missing', async () => {
      // Arrange
      const incompleteData = {
        id: '',
      } as UserMetadataModelUpdatableInterface;

      // Act & Assert
      await expect(service.update(incompleteData)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update(incompleteData)).rejects.toThrow(
        'ID is required for update operation',
      );
    });

    it('should throw NotFoundException when entity not found', async () => {
      // Arrange
      const updateData = { ...mockUserMetadata, firstName: 'Updated' };
      mockRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(updateData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should rethrow HttpException errors', async () => {
      // Arrange
      const updateData = { ...mockUserMetadata, firstName: 'Updated' };
      mockRepository.findOne.mockRejectedValue(
        new BadRequestException('bad request'),
      );

      // Act & Assert
      await expect(service.update(updateData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw InternalServerErrorException on unexpected error', async () => {
      // Arrange
      const updateData = { ...mockUserMetadata, firstName: 'Updated' };
      mockRepository.findOne.mockRejectedValue(new Error('db error'));

      // Act & Assert
      await expect(service.update(updateData)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
