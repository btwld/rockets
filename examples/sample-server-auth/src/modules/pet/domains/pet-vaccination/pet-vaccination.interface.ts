import {
  AuditInterface,
  ByIdInterface,
  CreateOneInterface,
  ReferenceIdInterface,
  RemoveOneInterface,
  UpdateOneInterface,
} from '@bitwild/rockets-common';

/**
 * Pet Vaccination Interface
 * Defines the shape of pet vaccination data
 */
export interface PetVaccinationInterface
  extends ReferenceIdInterface,
    AuditInterface {
  petId: string;
  vaccineName: string;
  administeredDate: Date;
  nextDueDate?: Date;
  veterinarian: string;
  batchNumber?: string;
  notes?: string;
  pet?: import('../pet/pet.interface').PetEntityInterface; // Relation to PetEntity
}

/**
 * Pet Vaccination Entity Interface
 * Defines the structure of the PetVaccination entity in the database
 */
export interface PetVaccinationEntityInterface
  extends PetVaccinationInterface {}

/**
 * Pet Vaccination Creatable Interface
 * Defines what fields can be provided when creating a vaccination record
 */
export interface PetVaccinationCreatableInterface
  extends Pick<
      PetVaccinationInterface,
      'petId' | 'vaccineName' | 'administeredDate' | 'veterinarian'
    >,
    Partial<
      Pick<PetVaccinationInterface, 'nextDueDate' | 'batchNumber' | 'notes'>
    > {}

/**
 * Pet Vaccination Updatable Interface
 * Defines what fields can be updated on a vaccination record
 */
export interface PetVaccinationUpdatableInterface
  extends Pick<PetVaccinationInterface, 'id'>,
    Partial<
      Pick<
        PetVaccinationInterface,
        | 'vaccineName'
        | 'administeredDate'
        | 'nextDueDate'
        | 'veterinarian'
        | 'batchNumber'
        | 'notes'
      >
    > {}

/**
 * Pet Vaccination Model Service Interface
 * Defines the contract for the PetVaccination model service
 */
export interface PetVaccinationModelServiceInterface
  extends ByIdInterface<string, PetVaccinationEntityInterface>,
    CreateOneInterface<
      PetVaccinationCreatableInterface,
      PetVaccinationEntityInterface
    >,
    UpdateOneInterface<
      PetVaccinationUpdatableInterface,
      PetVaccinationEntityInterface
    >,
    RemoveOneInterface<
      Pick<PetVaccinationEntityInterface, 'id'>,
      PetVaccinationEntityInterface
    > {
  findByPetId(petId: string): Promise<PetVaccinationEntityInterface[]>;
}
