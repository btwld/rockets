import { ByIdInterface, ReferenceIdInterface } from '@bitwild/rockets-app';
import { PetVaccinationEntityInterface } from '../pet-vaccination/pet-vaccination.interface';
import { PetAppointmentEntityInterface } from '../pet-appointment/pet-appointment.interface';

// Audit field type aliases for consistency
export type AuditDateCreated = Date;
export type AuditDateUpdated = Date;
export type AuditDateDeleted = Date | null;
export type AuditVersion = number;

/**
 * Pet Status Enumeration
 * Defines possible status values for pets
 */
export enum PetStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * Pet Interface
 * Defines the shape of pet data in API responses
 */
export interface PetInterface extends ReferenceIdInterface {
  name: string;
  species: string;
  breed?: string;
  age: number;
  color?: string;
  description?: string;
  status: PetStatus;
  userId: string;
  dateCreated: AuditDateCreated;
  dateUpdated: AuditDateUpdated;
  dateDeleted: AuditDateDeleted;
  version: AuditVersion;
}

/**
 * Pet Entity Interface
 * Defines the structure of the Pet entity in the database
 */
export interface PetEntityInterface extends PetInterface {
  vaccinations?: PetVaccinationEntityInterface[];
  appointments?: PetAppointmentEntityInterface[];
}

/**
 * Pet Creatable Interface
 * Defines what fields can be provided when creating a pet
 */
export interface PetCreatableInterface
  extends Pick<PetInterface, 'name' | 'species' | 'age' | 'userId'>,
    Partial<Pick<PetInterface, 'breed' | 'color' | 'description' | 'status'>> {}

/**
 * Pet Updatable Interface
 * Defines what fields can be updated on a pet (excludes userId)
 */
export interface PetUpdatableInterface
  extends Partial<
    Pick<
      PetInterface,
      'name' | 'species' | 'breed' | 'age' | 'color' | 'description' | 'status'
    >
  > {}

/**
 * Pet Model Updatable Interface
 * Includes ID for model service operations and supports soft delete
 */
export interface PetModelUpdatableInterface extends PetUpdatableInterface {
  id: string;
  dateDeleted?: AuditDateDeleted;
  version?: AuditVersion;
}

/**
 * Pet Model Service Interface
 * Defines the contract for the Pet model service
 */
export interface PetModelServiceInterface
  extends ByIdInterface<string, PetEntityInterface> {
  create(data: PetCreatableInterface): Promise<PetEntityInterface>;
  update(data: PetModelUpdatableInterface): Promise<PetEntityInterface>;
  remove(query: Pick<PetEntityInterface, 'id'>): Promise<PetEntityInterface>;
  /**
   * Find pets by user ID
   */
  findByUserId(userId: string): Promise<PetEntityInterface[]>;

  /**
   * Get pet by ID with proper error handling
   */
  getPetById(id: string): Promise<PetEntityInterface>;

  /**
   * Get pets by user ID with proper error handling
   */
  getPetsByUserId(userId: string): Promise<PetEntityInterface[]>;

  /**
   * Update pet data (excludes userId modification)
   */
  updatePet(
    id: string,
    petData: PetUpdatableInterface,
  ): Promise<PetEntityInterface>;

  /**
   * Soft delete a pet
   */
  softDelete(id: string): Promise<PetEntityInterface>;
}
