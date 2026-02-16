import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { RepositoryInterface, RuntimeException } from '@concepta/nestjs-common';
import { GenericUserMetadataModelService } from './user-metadata.model.service';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../constants/user-metadata.constants';
import {
  UserMetadataEntityInterface,
  UserMetadataModelUpdatableInterface,
} from '../interfaces/user-metadata.interface';

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
      // Arrange
      jest.spyOn(service, 'byId').mockResolvedValue(mockUserMetadata);

      // Act
      const result = await service.getUserMetadataById('metadata-123');

      // Assert
      expect(result).toEqual(mockUserMetadata);
      expect(service.byId).toHaveBeenCalledWith('metadata-123');
    });

    it('should throw NotFoundException when not found', async () => {
      // Arrange
      jest.spyOn(service, 'byId').mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUserMetadataById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should rethrow RuntimeException', async () => {
      // Arrange
      jest
        .spyOn(service, 'byId')
        .mockRejectedValue(new RuntimeException('runtime error'));

      // Act & Assert
      await expect(service.getUserMetadataById('metadata-123')).rejects.toThrow(
        RuntimeException,
      );
    });

    it('should throw InternalServerErrorException on unexpected error', async () => {
      // Arrange
      jest.spyOn(service, 'byId').mockRejectedValue(new Error('db error'));

      // Act & Assert
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
        where: { userId: 'user-123' },
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
      // Arrange
      jest.spyOn(service, 'findByUserId').mockResolvedValue(mockUserMetadata);

      // Act
      const result = await service.hasUserMetadata('user-123');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when user has no metadata', async () => {
      // Arrange
      jest.spyOn(service, 'findByUserId').mockResolvedValue(null);

      // Act
      const result = await service.hasUserMetadata('user-123');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('updateUserMetadata', () => {
    it('should update existing user metadata', async () => {
      // Arrange
      const updateData = { firstName: 'Updated' };
      jest.spyOn(service, 'findByUserId').mockResolvedValue(mockUserMetadata);
      jest
        .spyOn(service, 'update')
        .mockResolvedValue({ ...mockUserMetadata, ...updateData });

      // Act
      const result = await service.updateUserMetadata('user-123', updateData);

      // Assert
      expect(service.findByUserId).toHaveBeenCalledWith('user-123');
      expect(service.update).toHaveBeenCalledWith({
        ...mockUserMetadata,
        ...updateData,
      });
      expect(result).toEqual(expect.objectContaining({ firstName: 'Updated' }));
    });

    it('should throw NotFoundException when user metadata not found', async () => {
      // Arrange
      jest.spyOn(service, 'findByUserId').mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateUserMetadata('non-existent', { firstName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createOrUpdate', () => {
    const newData = { firstName: 'Jane', lastName: 'Smith' };

    it('should create new metadata when none exists', async () => {
      // Arrange
      jest.spyOn(service, 'findByUserId').mockResolvedValue(null);
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ ...mockUserMetadata, ...newData });

      // Act
      const result = await service.createOrUpdate('user-123', newData);

      // Assert
      expect(service.findByUserId).toHaveBeenCalledWith('user-123');
      expect(service.create).toHaveBeenCalledWith({
        userId: 'user-123',
        ...newData,
      });
      expect(result).toEqual({ ...mockUserMetadata, ...newData });
    });

    it('should update existing metadata when it exists', async () => {
      // Arrange
      jest.spyOn(service, 'findByUserId').mockResolvedValue(mockUserMetadata);
      jest
        .spyOn(service, 'update')
        .mockResolvedValue({ ...mockUserMetadata, ...newData });

      // Act
      const result = await service.createOrUpdate('user-123', newData);

      // Assert
      expect(service.findByUserId).toHaveBeenCalledWith('user-123');
      expect(service.update).toHaveBeenCalledWith({
        id: 'metadata-123',
        ...newData,
      });
      expect(result).toEqual({ ...mockUserMetadata, ...newData });
    });
  });

  describe('getUserMetadataByUserId', () => {
    it('should return metadata when user exists', async () => {
      // Arrange
      jest.spyOn(service, 'findByUserId').mockResolvedValue(mockUserMetadata);

      // Act
      const result = await service.getUserMetadataByUserId('user-123');

      // Assert
      expect(result).toEqual(mockUserMetadata);
    });

    it('should return null when user has no metadata', async () => {
      // Arrange
      jest.spyOn(service, 'findByUserId').mockResolvedValue(null);

      // Act
      const result = await service.getUserMetadataByUserId('non-existent');

      // Assert
      expect(result).toBeNull();
    });

    it('should rethrow RuntimeException', async () => {
      // Arrange
      jest
        .spyOn(service, 'findByUserId')
        .mockRejectedValue(new RuntimeException('runtime error'));

      // Act & Assert
      await expect(service.getUserMetadataByUserId('user-123')).rejects.toThrow(
        RuntimeException,
      );
    });

    it('should throw InternalServerErrorException on unexpected error', async () => {
      // Arrange
      jest
        .spyOn(service, 'findByUserId')
        .mockRejectedValue(new Error('db error'));

      // Act & Assert
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
      mockRepository.merge.mockReturnValue(updateData);
      mockRepository.save.mockResolvedValue(updateData);
      // Skip base class validation (class-validator) since we test update logic
      jest
        .spyOn(service as never, 'validate')
        .mockResolvedValue(updateData as never);

      // Act
      const result = await service.update(updateData);

      // Assert
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'metadata-123' },
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
