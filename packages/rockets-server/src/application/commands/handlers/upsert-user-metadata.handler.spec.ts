import { RepositoryInterface } from '@concepta/nestjs-repository';
import { UpsertUserMetadataHandler } from './upsert-user-metadata.handler';
import { UpsertUserMetadataCommand } from '../impl/upsert-user-metadata.command';
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

describe('UpsertUserMetadataHandler', () => {
  let handler: UpsertUserMetadataHandler;
  let repo: jest.Mocked<RepositoryInterface<UserMetadataEntityInterface>>;

  beforeEach(() => {
    repo = mockRepository();
    handler = new UpsertUserMetadataHandler(repo);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create metadata when none exists', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockResolvedValue(mockMetadata);

    const result = await handler.execute(
      new UpsertUserMetadataCommand('user-1', { firstName: 'John' }),
    );

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { field: 'userId', operator: 'eq', value: 'user-1' },
    });
    expect(repo.create).toHaveBeenCalledWith({
      firstName: 'John',
      userId: 'user-1',
    });
    expect(result).toEqual(mockMetadata);
  });

  it('should update existing metadata', async () => {
    const updated = { ...mockMetadata, firstName: 'Updated' };
    repo.findOne.mockResolvedValue(mockMetadata);
    repo.update.mockResolvedValue(updated);

    const result = await handler.execute(
      new UpsertUserMetadataCommand('user-1', { firstName: 'Updated' }),
    );

    expect(repo.update).toHaveBeenCalledWith(
      mockMetadata,
      expect.objectContaining({ firstName: 'Updated' }),
    );
    expect(result).toEqual(updated);
  });

  it('should filter undefined values on update', async () => {
    repo.findOne.mockResolvedValue(mockMetadata);
    repo.update.mockResolvedValue(mockMetadata);

    await handler.execute(
      new UpsertUserMetadataCommand('user-1', {
        firstName: 'John',
        lastName: undefined,
      }),
    );

    expect(repo.update).toHaveBeenCalledWith(
      mockMetadata,
      expect.not.objectContaining({ lastName: undefined }),
    );
  });
});
