import { Test, TestingModule } from '@nestjs/testing';
import { RepositoryInterface } from '@concepta/nestjs-repository';
import { GenericUserMetadataModelService } from './rockets-auth-user-metadata.model.service';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../config/user-metadata.constants';
import {
  UserMetadataException,
  UserMetadataNotFoundException,
} from '../../domain/exceptions/user-metadata.exception';
import { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import {
  RocketsAuthUserMetadataModelUpdatableInterface,
  RocketsAuthUserMetadataUpdatableInterface,
} from '../../interfaces/rockets-auth-user-metadata-updatable.interface';

describe('GenericUserMetadataModelService', () => {
  let service: GenericUserMetadataModelService;
  let mockRepository: jest.Mocked<
    RepositoryInterface<RocketsAuthUserMetadataEntityInterface>
  >;

  const mockUserMetadata: RocketsAuthUserMetadataEntityInterface & {
    firstName?: string;
    lastName?: string;
    bio?: string;
  } = {
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
  };

  const mockUpdateDto = class {
    id!: string;
    userId!: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
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

  describe('byId', () => {
    it('delegates to repo.findOne with Where.eq on id', async () => {
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);
      const result = await service.byId('metadata-123');
      expect(result).toEqual(mockUserMetadata);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { field: 'id', operator: 'eq', value: 'metadata-123' },
      });
    });
  });

  describe('create', () => {
    it('delegates to repo.create', async () => {
      const payload = { userId: 'u1', firstName: 'A' };
      mockRepository.create.mockResolvedValue(mockUserMetadata);
      const result = await service.create(payload);
      expect(mockRepository.create).toHaveBeenCalledWith(payload);
      expect(result).toEqual(mockUserMetadata);
    });
  });

  describe('getUserMetadataById', () => {
    it('returns metadata when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);
      const result = await service.getUserMetadataById('metadata-123');
      expect(result).toEqual(mockUserMetadata);
    });

    it('throws UserMetadataNotFoundException when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.getUserMetadataById('missing')).rejects.toThrow(
        UserMetadataNotFoundException,
      );
    });
  });

  describe('findByUserId', () => {
    it('returns metadata for existing user', async () => {
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);
      const result = await service.findByUserId('user-123');
      expect(result).toEqual(mockUserMetadata);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { field: 'userId', operator: 'eq', value: 'user-123' },
      });
    });

    it('returns null when missing', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.findByUserId('none')).resolves.toBeNull();
    });
  });

  describe('hasUserMetadata', () => {
    it('returns true when repo finds a row', async () => {
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);
      await expect(service.hasUserMetadata('user-123')).resolves.toBe(true);
    });

    it('returns false when repo returns null', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.hasUserMetadata('user-123')).resolves.toBe(false);
    });
  });

  describe('createOrUpdate', () => {
    it('creates when no existing metadata', async () => {
      const data = { firstName: 'Jane' } as RocketsAuthUserMetadataUpdatableInterface;
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue({
        ...mockUserMetadata,
        firstName: 'Jane',
      } as RocketsAuthUserMetadataEntityInterface);

      const result = await service.createOrUpdate('user-123', data);

      expect(mockRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        firstName: 'Jane',
      });
      expect((result as typeof mockUserMetadata).firstName).toBe('Jane');
    });

    it('updates when metadata exists and strips undefined fields from payload', async () => {
      const data = {
        firstName: 'X',
        bio: undefined,
      } as RocketsAuthUserMetadataUpdatableInterface;
      mockRepository.findOne
        .mockResolvedValueOnce(mockUserMetadata)
        .mockResolvedValueOnce(mockUserMetadata);
      const updated = {
        ...mockUserMetadata,
        firstName: 'X',
      } as RocketsAuthUserMetadataEntityInterface;
      mockRepository.update.mockResolvedValue(updated);

      const result = await service.createOrUpdate('user-123', data);

      const [, updatePayload] = mockRepository.update.mock.calls[0] as [
        RocketsAuthUserMetadataEntityInterface,
        Record<string, unknown>,
      ];
      expect(updatePayload.firstName).toBe('X');
      expect(updatePayload.bio).toBe('Software Developer');
      expect((result as typeof mockUserMetadata).firstName).toBe('X');
    });
  });

  describe('getUserMetadataByUserId', () => {
    it('returns row when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);
      await expect(service.getUserMetadataByUserId('user-123')).resolves.toEqual(
        mockUserMetadata,
      );
    });

    it('throws when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(
        service.getUserMetadataByUserId('missing'),
      ).rejects.toThrow(UserMetadataNotFoundException);
    });
  });

  describe('updateUserMetadata', () => {
    it('loads by userId then updates merged entity', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockUserMetadata)
        .mockResolvedValueOnce(mockUserMetadata);
      const merged = {
        ...mockUserMetadata,
        firstName: 'U',
      } as RocketsAuthUserMetadataEntityInterface;
      mockRepository.update.mockResolvedValue(merged);

      const result = await service.updateUserMetadata(
        'user-123',
        { firstName: 'U' } as Parameters<
          GenericUserMetadataModelService['updateUserMetadata']
        >[1],
      );

      expect(mockRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { field: 'userId', operator: 'eq', value: 'user-123' },
      });
      expect(mockRepository.update).toHaveBeenCalled();
      expect((result as typeof mockUserMetadata).firstName).toBe('U');
    });
  });

  describe('update', () => {
    it('updates when entity exists', async () => {
      const updateData = {
        ...mockUserMetadata,
        firstName: 'Updated',
      } as RocketsAuthUserMetadataModelUpdatableInterface;
      mockRepository.findOne.mockResolvedValue(mockUserMetadata);
      mockRepository.update.mockResolvedValue({
        ...mockUserMetadata,
        firstName: 'Updated',
      } as RocketsAuthUserMetadataEntityInterface);

      const result = await service.update(updateData);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { field: 'id', operator: 'eq', value: 'metadata-123' },
      });
      expect((result as typeof mockUserMetadata).firstName).toBe('Updated');
    });

    it('throws UserMetadataException when id missing', async () => {
      const incomplete: RocketsAuthUserMetadataModelUpdatableInterface = {
        id: '',
      };
      await expect(service.update(incomplete)).rejects.toThrow(
        UserMetadataException,
      );
      await expect(service.update(incomplete)).rejects.toThrow(
        'ID is required for update operation',
      );
    });

    it('throws UserMetadataNotFoundException when row missing', async () => {
      const updateData = {
        ...mockUserMetadata,
        firstName: 'N',
      } as RocketsAuthUserMetadataModelUpdatableInterface;
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.update(updateData)).rejects.toThrow(
        UserMetadataNotFoundException,
      );
    });
  });
});
