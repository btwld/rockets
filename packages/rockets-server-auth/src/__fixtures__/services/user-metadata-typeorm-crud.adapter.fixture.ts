import { Injectable } from '@nestjs/common';
import { CrudAdapter, TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import {
  RepositoryInterface,
  RepositoryInternals,
} from '@concepta/nestjs-common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  SaveOptions,
} from 'typeorm';
import { UserMetadataEntityFixture } from '../user/user-metadata.entity.fixture';
import { RocketsAuthUserMetadataEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-entity.interface';

@Injectable()
export class UserMetadataTypeOrmCrudAdapterFixture
  extends TypeOrmCrudAdapter<RocketsAuthUserMetadataEntityInterface>
  implements
    CrudAdapter<RocketsAuthUserMetadataEntityInterface>,
    RepositoryInterface<RocketsAuthUserMetadataEntityInterface>
{
  constructor(
    @InjectRepository(UserMetadataEntityFixture)
    protected readonly repo: Repository<RocketsAuthUserMetadataEntityInterface>,
  ) {
    super(repo);
  }

  // RepositoryInterface implementation - delegate to TypeORM repository
  async find(
    options?: RepositoryInternals.FindManyOptions<RocketsAuthUserMetadataEntityInterface>,
  ): Promise<RocketsAuthUserMetadataEntityInterface[]> {
    return this.repo.find(
      options as FindManyOptions<RocketsAuthUserMetadataEntityInterface>,
    );
  }

  async findOne(
    options: RepositoryInternals.FindOneOptions<RocketsAuthUserMetadataEntityInterface>,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null> {
    return this.repo.findOne(
      options as FindOneOptions<RocketsAuthUserMetadataEntityInterface>,
    );
  }

  create(
    entityLike: DeepPartial<RocketsAuthUserMetadataEntityInterface>,
  ): RocketsAuthUserMetadataEntityInterface {
    return this.repo.create(entityLike);
  }

  merge(
    mergeIntoEntity: RocketsAuthUserMetadataEntityInterface,
    ...entityLikes: DeepPartial<RocketsAuthUserMetadataEntityInterface>[]
  ): RocketsAuthUserMetadataEntityInterface {
    return this.repo.merge(mergeIntoEntity, ...entityLikes);
  }

  async save<T extends DeepPartial<RocketsAuthUserMetadataEntityInterface>>(
    entities: T[],
    options?: RepositoryInternals.SaveOptions,
  ): Promise<(T & RocketsAuthUserMetadataEntityInterface)[]>;
  async save<T extends DeepPartial<RocketsAuthUserMetadataEntityInterface>>(
    entity: T,
    options?: RepositoryInternals.SaveOptions,
  ): Promise<T & RocketsAuthUserMetadataEntityInterface>;
  async save<T extends DeepPartial<RocketsAuthUserMetadataEntityInterface>>(
    entityOrEntities: T | T[],
    options?: RepositoryInternals.SaveOptions,
  ): Promise<
    | (T & RocketsAuthUserMetadataEntityInterface)
    | (T & RocketsAuthUserMetadataEntityInterface)[]
  > {
    // Handle array vs single entity for TypeORM compatibility
    if (Array.isArray(entityOrEntities)) {
      return this.repo.save(
        entityOrEntities,
        options as SaveOptions,
      ) as Promise<(T & RocketsAuthUserMetadataEntityInterface)[]>;
    } else {
      return this.repo.save(
        entityOrEntities,
        options as SaveOptions,
      ) as Promise<T & RocketsAuthUserMetadataEntityInterface>;
    }
  }

  async remove(
    entities: RocketsAuthUserMetadataEntityInterface[],
  ): Promise<RocketsAuthUserMetadataEntityInterface[]>;
  async remove(
    entity: RocketsAuthUserMetadataEntityInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface>;
  async remove(
    entityOrEntities:
      | RocketsAuthUserMetadataEntityInterface
      | RocketsAuthUserMetadataEntityInterface[],
  ): Promise<
    | RocketsAuthUserMetadataEntityInterface
    | RocketsAuthUserMetadataEntityInterface[]
  > {
    // Handle array vs single entity for TypeORM compatibility
    if (Array.isArray(entityOrEntities)) {
      return this.repo.remove(entityOrEntities);
    } else {
      return this.repo.remove(entityOrEntities);
    }
  }

  gt<T>(value: T): { $gt: T } {
    return { $gt: value };
  }

  gte<T>(value: T): { $gte: T } {
    return { $gte: value };
  }

  lt<T>(value: T): { $lt: T } {
    return { $lt: value };
  }

  lte<T>(value: T): { $lte: T } {
    return { $lte: value };
  }
}
