import { RepositoryInterface } from '@concepta/nestjs-repository';
import { GetUserMetadataHandler } from './get-user-metadata.handler';
import { GetUserMetadataQuery } from '../impl/get-user-metadata.query';
import { UserMetadataEntityInterface } from '../../../domain/interfaces/user-metadata.interface';

function mockRepository(): jest.Mocked<
  RepositoryInterface<UserMetadataEntityInterface>
> {
  return {
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
  } as unknown as jest.Mocked<RepositoryInterface<UserMetadataEntityInterface>>;
}

const mockMetadata: UserMetadataEntityInterface = {
  id: 'metadata-1',
  userId: 'user-1',
  dateCreated: new Date(),
  dateUpdated: new Date(),
  dateDeleted: null,
  version: 1,
};

describe('GetUserMetadataHandler', () => {
  let handler: GetUserMetadataHandler;
  let repo: jest.Mocked<RepositoryInterface<UserMetadataEntityInterface>>;

  beforeEach(() => {
    repo = mockRepository();
    handler = new GetUserMetadataHandler(repo);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return metadata when found', async () => {
    repo.findOne.mockResolvedValue(mockMetadata);

    const result = await handler.execute(new GetUserMetadataQuery('user-1'));

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { field: 'userId', operator: 'eq', value: 'user-1' },
    });
    expect(result).toEqual(mockMetadata);
  });

  it('should return null when not found', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await handler.execute(
      new GetUserMetadataQuery('non-existent'),
    );

    expect(result).toBeNull();
  });
});
