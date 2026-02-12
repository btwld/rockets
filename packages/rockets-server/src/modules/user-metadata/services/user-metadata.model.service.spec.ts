import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { RepositoryInterface } from '@concepta/nestjs-common';
import { logAndGetErrorDetails } from '../../../utils/error-logging.helper';
import { GenericUserMetadataModelService } from './user-metadata.model.service';
import { UserMetadataEntityInterface } from '../interfaces/user-metadata.interface';

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
    jest.spyOn(service, 'byId').mockResolvedValue(null);

    await expect(service.getUserMetadataById('missing-id')).rejects.toThrow(
      NotFoundException,
    );
    expect(logAndGetErrorDetails).not.toHaveBeenCalled();
  });

  it('maps unexpected errors to InternalServerErrorException in getUserMetadataById', async () => {
    jest.spyOn(service, 'byId').mockRejectedValue(new Error('db failed'));

    await expect(service.getUserMetadataById('broken-id')).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(logAndGetErrorDetails).toHaveBeenCalledTimes(1);
  });

  it('rethrows NotFoundException from getUserMetadataByUserId', async () => {
    jest.spyOn(service, 'findByUserId').mockResolvedValue(null);

    await expect(
      service.getUserMetadataByUserId('missing-user'),
    ).rejects.toThrow(NotFoundException);
    expect(logAndGetErrorDetails).not.toHaveBeenCalled();
  });

  it('maps unexpected errors to InternalServerErrorException in getUserMetadataByUserId', async () => {
    jest
      .spyOn(service, 'findByUserId')
      .mockRejectedValue(new Error('query failed'));

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
