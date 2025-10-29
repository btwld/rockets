import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthUser } from '@concepta/nestjs-authentication';
import { AuthorizedUser } from '@bitwild/rockets';
import { PetCreateDto, PetUpdateDto, PetResponseDto } from '../dto/pet.dto';
import { PetModelService } from '../modules/pet/pet-model.service';
import { PetEntityInterface } from '../modules/pet/pet.interface';

@ApiTags('pets')
@ApiBearerAuth()
@Controller('pets')
export class PetsController {
  constructor(
    private readonly petModelService: PetModelService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new pet' })
  @ApiResponse({
    status: 201,
    description: 'Pet has been successfully created.',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async create(
    @Body() createPetDto: PetCreateDto,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetResponseDto> {
    const petData = {
      ...createPetDto,
      userId: user.id, // Override with authenticated user's ID for security
    };
    
    const savedPet = await this.petModelService.create(petData);
    return this.mapToResponseDto(savedPet);
  }

  @Get()
  @ApiOperation({ summary: 'Get all pets for the authenticated user' })
  @ApiQuery({
    name: 'species',
    required: false,
    description: 'Filter by species',
    example: 'dog',
  })
  @ApiResponse({
    status: 200,
    description: 'List of pets.',
    type: [PetResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async findAll(
    @AuthUser() user: AuthorizedUser,
    @Query('species') species?: string,
  ): Promise<PetResponseDto[]> {
    let pets: PetEntityInterface[];
    
    if (species) {
      pets = await this.petModelService.findByUserIdAndSpecies(user.id, species);
    } else {
      pets = await this.petModelService.findByUserId(user.id);
    }

    return pets.map(pet => this.mapToResponseDto(pet));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a pet by ID' })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({
    status: 200,
    description: 'The pet with the specified ID.',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Pet not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async findOne(
    @Param('id') id: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetResponseDto> {
    // Check if user owns the pet first
    const isOwner = await this.petModelService.isPetOwnedByUser(id, user.id);
    if (!isOwner) {
      throw new NotFoundException('Pet not found');
    }

    const pet = await this.petModelService.getPetById(id);
    return this.mapToResponseDto(pet);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a pet' })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({
    status: 200,
    description: 'Pet has been successfully updated.',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Pet not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async update(
    @Param('id') id: string,
    @Body() updatePetDto: PetUpdateDto,
    @AuthUser() user: AuthorizedUser,
  ): Promise<PetResponseDto> {
    // Check if user owns the pet first
    const isOwner = await this.petModelService.isPetOwnedByUser(id, user.id);
    if (!isOwner) {
      throw new NotFoundException('Pet not found');
    }

    // Update using model service (userId is already excluded from DTO)
    const updatedPet = await this.petModelService.updatePet(id, updatePetDto);
    return this.mapToResponseDto(updatedPet);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a pet (soft delete)' })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 204, description: 'Pet has been successfully deleted.' })
  @ApiResponse({ status: 404, description: 'Pet not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async remove(
    @Param('id') id: string,
    @AuthUser() user: AuthorizedUser,
  ): Promise<void> {
    // Check if user owns the pet first
    const isOwner = await this.petModelService.isPetOwnedByUser(id, user.id);
    if (!isOwner) {
      throw new NotFoundException('Pet not found');
    }

    // Perform soft delete using model service
    await this.petModelService.softDelete(id);
  }

  private mapToResponseDto(pet: PetEntityInterface): PetResponseDto {
    return {
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      age: pet.age,
      color: pet.color,
      description: pet.description,
      status: pet.status,
      userId: pet.userId,
      dateCreated: pet.dateCreated,
      dateUpdated: pet.dateUpdated,
      dateDeleted: pet.dateDeleted,
      version: pet.version,
    };
  }
}