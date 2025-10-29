import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  AccessControlCreateMany,
  AccessControlCreateOne,
  AccessControlDeleteOne,
  AccessControlGuard,
  AccessControlQuery,
  AccessControlReadMany,
  AccessControlReadOne,
  AccessControlRecoverOne,
  AccessControlUpdateOne,
} from '@concepta/nestjs-access-control';
import {
  CrudBody,
  CrudCreateOne,
  CrudDeleteOne,
  CrudReadOne,
  CrudRequest,
  CrudRequestInterface,
  CrudUpdateOne,
  CrudControllerInterface,
  CrudController,
  CrudCreateMany,
  CrudReadMany,
  CrudRecoverOne,
} from '@concepta/nestjs-crud';
import { CrudRelations } from '@concepta/nestjs-crud/dist/crud/decorators/routes/crud-relations.decorator';
import { 
  PetCreateManyDto, 
  PetCreateDto, 
  PetPaginatedDto, 
  PetUpdateDto, 
  PetResponseDto 
} from './pet.dto';
import { PetAccessQueryService } from './pet-access-query.service';
import { PetResource } from './pet.types';
import { PetCrudService } from './pet.crud.service';
import { 
  PetEntityInterface, 
  PetCreatableInterface, 
  PetUpdatableInterface 
} from './pet.interface';
import { PetEntity } from './pet.entity';
import { PetVaccinationEntity, PetVaccinationCrudService } from '../pet-vaccination';
import { PetAppointmentEntity, PetAppointmentCrudService } from '../pet-appointment';
import { AuthorizedUser } from '@bitwild/rockets';
import { AuthUser } from '@concepta/nestjs-authentication';
import { UseGuards } from '@nestjs/common';
import { AuthJwtGuard } from '@concepta/nestjs-auth-jwt';
import { AppRole } from '../../../../app.acl';

@CrudController({
  path: 'pets',
  model: {
    type: PetResponseDto,
    paginatedType: PetPaginatedDto,
  },
})
@CrudRelations<PetEntity, [PetVaccinationEntity, PetAppointmentEntity]>({
  rootKey: 'id',
  relations: [
    {
      join: 'LEFT',
      cardinality: 'many',
      service: PetVaccinationCrudService,
      property: 'vaccinations',
      primaryKey: 'id',
      foreignKey: 'petId',
    },
    {
      join: 'LEFT',
      cardinality: 'many',
      service: PetAppointmentCrudService,
      property: 'appointments',
      primaryKey: 'id',
      foreignKey: 'petId',
    },
  ],
})
@AccessControlQuery({
  service: PetAccessQueryService,
})
@UseGuards(AccessControlGuard)
@ApiTags('Pets')
@ApiBearerAuth()
export class PetCrudController implements CrudControllerInterface<
  PetEntity,
  PetCreatableInterface,
  PetUpdatableInterface
> {
  constructor(private petCrudService: PetCrudService) {}

  @CrudReadMany()
  @AccessControlReadMany(PetResource.Many)
  async getMany(
    @CrudRequest() crudRequest: CrudRequestInterface<PetEntity>,
    @AuthUser() user: AuthorizedUser,
  ) {
    // If user has only "user" role (ownership-based access), filter by userId
    const roleNames = user.userRoles?.map(ur => ur.role.name) || [];
    const hasOnlyUserRole = roleNames.includes(AppRole.User) && 
                            !roleNames.includes(AppRole.Admin) && 
                            !roleNames.includes(AppRole.Manager);
    
    if (hasOnlyUserRole) {
      // Add userId filter to ensure user only sees their own pets
      const modifiedRequest: CrudRequestInterface<PetEntity> = {
        ...crudRequest,
        parsed: {
          ...(crudRequest.parsed || {}),
          filter: [
            ...((crudRequest.parsed?.filter as Array<{ field: string; operator: string; value: unknown }>) || []),
            { field: 'userId', operator: '$eq', value: user.id }
          ],
        } as typeof crudRequest.parsed,
      };
      return this.petCrudService.getMany(modifiedRequest);
    }
    
    // Admins and managers can see all pets
    return this.petCrudService.getMany(crudRequest); 
  }

  @CrudReadOne()
  @AccessControlReadOne(PetResource.One)
  async getOne(@CrudRequest() crudRequest: CrudRequestInterface<PetEntity>) {
    return this.petCrudService.getOne(crudRequest);
  }

  @CrudCreateOne({
    dto: PetCreateDto
  })
  @AccessControlCreateOne(PetResource.One)
  async createOne(
    @CrudRequest() crudRequest: CrudRequestInterface<PetEntity>,
    @CrudBody() petCreateDto: PetCreateDto,
    @AuthUser() user: AuthorizedUser,
  ) {
    // Assign userId from authenticated user
    petCreateDto.userId = user.id;
    return this.petCrudService.createOne(crudRequest, petCreateDto);
  }

  @CrudUpdateOne({
    dto: PetUpdateDto
  })
  @AccessControlUpdateOne(PetResource.One)
  async updateOne(
    @CrudRequest() crudRequest: CrudRequestInterface<PetEntity>,
    @CrudBody() petUpdateDto: PetUpdateDto,
  ) {
    return this.petCrudService.updateOne(crudRequest, petUpdateDto);
  }

  @CrudDeleteOne()
  @AccessControlDeleteOne(PetResource.One)
  async deleteOne(
    @CrudRequest() crudRequest: CrudRequestInterface<PetEntity>,
    @AuthUser() user: AuthorizedUser,
  ) {
    console.log('Delete attempt by user:', user.id);
    console.log('User roles:', user.userRoles?.map(ur => ur.role.name));
    return this.petCrudService.deleteOne(crudRequest);
  }

  @CrudRecoverOne()
  @AccessControlRecoverOne(PetResource.One)
  async recoverOne(@CrudRequest() crudRequest: CrudRequestInterface<PetEntity>) {
    return this.petCrudService.recoverOne(crudRequest);
  }
}

