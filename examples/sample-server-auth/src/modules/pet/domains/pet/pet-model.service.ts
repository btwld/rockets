import { Injectable } from '@nestjs/common';
import {
  InjectDynamicRepository,
  type RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import {
  PetEntityInterface,
  PetCreatableInterface,
  PetUpdatableInterface,
  PetModelUpdatableInterface,
  PetModelServiceInterface,
  PetStatus,
} from './pet.interface';
import { PetEntity } from './pet.entity';
import { PetCreateDto, PetUpdateDto } from './pet.dto';
import { PetNotFoundException } from './pet.exception';

/**
 * Pet domain service backed by the dynamic repository registered for the
 * pet bundle. Database-agnostic — depends only on `RepositoryInterface`,
 * never on `Repository<PetEntity>` from typeorm.
 */
@Injectable()
export class PetModelService implements PetModelServiceInterface {
  public readonly createDto = PetCreateDto;
  public readonly updateDto = PetUpdateDto;

  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly repo: RepositoryInterface<PetEntity>,
  ) {}

  async byId(id: string): Promise<PetEntityInterface | null> {
    return this.repo.findOne({
      where: Where.eq<PetEntity>('id', id),
    });
  }

  async create(data: PetCreatableInterface): Promise<PetEntityInterface> {
    const petData: PetCreatableInterface = {
      status: PetStatus.ACTIVE,
      ...data,
    };
    return this.repo.create(petData as PetEntity);
  }

  async update(data: PetModelUpdatableInterface): Promise<PetEntityInterface> {
    const { id, ...rest } = data;
    const existing = (await this.getPetById(id)) as PetEntity;
    return this.repo.update(existing, rest as PetEntity);
  }

  async remove(
    query: Pick<PetEntityInterface, 'id'>,
  ): Promise<PetEntityInterface> {
    const pet = (await this.getPetById(query.id)) as PetEntity;
    await this.repo.delete(pet);
    return pet;
  }

  async getPetById(id: string): Promise<PetEntityInterface> {
    const pet = await this.byId(id);
    if (!pet) {
      throw new PetNotFoundException();
    }
    return pet;
  }

  async findByUserId(userId: string): Promise<PetEntityInterface[]> {
    return this.repo.find({
      where: Where.eq<PetEntity>('userId', userId),
    });
  }

  async getPetsByUserId(userId: string): Promise<PetEntityInterface[]> {
    return this.findByUserId(userId);
  }

  async updatePet(
    id: string,
    petData: PetUpdatableInterface,
  ): Promise<PetEntityInterface> {
    return this.update({
      id,
      ...petData,
    });
  }

  async softDelete(id: string): Promise<PetEntityInterface> {
    const pet = (await this.getPetById(id)) as PetEntity;
    return this.repo.softDelete(pet);
  }

  async findByUserIdAndSpecies(
    userId: string,
    species: string,
  ): Promise<PetEntityInterface[]> {
    return this.repo.find({
      where: Where.and(
        Where.eq<PetEntity>('userId', userId),
        Where.eq<PetEntity>('species', species),
      ),
    });
  }

  async isPetOwnedByUser(petId: string, userId: string): Promise<boolean> {
    const pet = await this.repo.findOne({
      where: Where.and(
        Where.eq<PetEntity>('id', petId),
        Where.eq<PetEntity>('userId', userId),
      ),
    });
    return !!pet;
  }
}
