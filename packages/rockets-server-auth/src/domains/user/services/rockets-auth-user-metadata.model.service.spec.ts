import { Test, TestingModule } from '@nestjs/testing';
import { RepositoryInterface } from '@concepta/nestjs-common';
import { GenericUserMetadataModelService } from './rockets-auth-user-metadata.model.service';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../constants/user-metadata.constants';
import {
  UserMetadataException,
  UserMetadataNotFoundException,
} from '../user-metadata.exception';
import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';

describe('GenericUserMetadataModelService', () => {
  let service: GenericUserMetadataModelService;
  let mockRepository: jest.Mocked<
    RepositoryInterface<RocketsAuthUserMetadataEntityInterface>
  >;

  const mockUserMetadata = {
    id: 'metadata-123',
    userId: 'user-123',
    firstName: 'John',
    lastName: 'Doe',
    bio: 'Software Developer',
  };

  const mockCreateDto = class {
    userId!: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
    [key: string]: unknown;
  };

  const mockUpdateDto = class {
    id!: string;
    userId!: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
    [key: string]: unknown;
  };

  beforeEach(async () => {
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
      RepositoryInterface<RocketsAuthUserMetadataEntityInterface>
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

    it('should throw UserMetadataNotFoundException when not found', async () => {
      // Arrange
      jest.spyOn(service, 'byId').mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUserMetadataById('non-existent')).rejects.toThrow(
        UserMetadataNotFoundException,
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
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'non-existent' },
      });
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
        ...mockUserMetadata,
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

    it('should throw UserMetadataNotFoundException when user not found', async () => {
      // Arrange
      jest.spyOn(service, 'findByUserId').mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getUserMetadataByUserId('non-existent'),
      ).rejects.toThrow(UserMetadataNotFoundException);
    });
  });

  describe('updateUserMetadata', () => {
    it('should update existing user metadata', async () => {
      // Arrange
      const updateData = { firstName: 'Updated Name' };
      jest
        .spyOn(service, 'getUserMetadataByUserId')
        .mockResolvedValue(mockUserMetadata);
      jest
        .spyOn(service, 'update')
        .mockResolvedValue({ ...mockUserMetadata, ...updateData });

      // Act
      const result = await service.updateUserMetadata('user-123', updateData);

      // Assert
      expect(service.getUserMetadataByUserId).toHaveBeenCalledWith('user-123');
      expect(service.update).toHaveBeenCalledWith({
        ...mockUserMetadata,
        ...updateData,
      });
      expect(result).toEqual({ ...mockUserMetadata, ...updateData });
    });
  });

  describe('update', () => {
    it('should update metadata successfully', async () => {
      // Arrange
      const updateData = { ...mockUserMetadata, firstName: 'Updated' };
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);
      mockRepository.merge.mockReturnValue(updateData);
      mockRepository.save.mockResolvedValue(updateData);

      // Act
      const result = await service.update(updateData);

      // Assert
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'metadata-123' },
      });
      expect(mockRepository.merge).toHaveBeenCalledWith(
        mockUserMetadata,
        updateData,
      );
      expect(mockRepository.save).toHaveBeenCalledWith(updateData);
      expect(result).toEqual(updateData);
    });

    it('should throw UserMetadataException when ID is missing', async () => {
      // Arrange - Create incomplete data that's missing the required 'id' field
      const incompleteData: Partial<RocketsAuthUserMetadataEntityInterface> = {
        firstName: 'Updated',
      };

      // Act & Assert
      await expect(
        service.update(
          incompleteData as RocketsAuthUserMetadataEntityInterface,
        ),
      ).rejects.toThrow(UserMetadataException);
      await expect(
        service.update(
          incompleteData as RocketsAuthUserMetadataEntityInterface,
        ),
      ).rejects.toThrow('ID is required for update operation');
    });

    it('should throw UserMetadataNotFoundException when entity not found', async () => {
      // Arrange
      const updateData = { ...mockUserMetadata, firstName: 'Updated' };
      mockRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(updateData)).rejects.toThrow(
        UserMetadataNotFoundException,
      );
    });
  });

  describe('validate', () => {
    it('should skip validation and return data as-is', async () => {
      // Arrange
      interface TestData {
        customField: string;
        dynamicField: number;
      }
      const testData: TestData = { customField: 'value', dynamicField: 123 };

      // Act
      const result = await service['validate'](
        class TestClass implements TestData {
          customField!: string;
          dynamicField!: number;
        },
        testData,
      );

      // Assert
      expect(result).toEqual(testData);
    });
  });
});
