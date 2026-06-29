import { AuditInterface, ReferenceIdInterface } from '@concepta/nestjs-core';
import {
  ByIdInterface,
  CreateOneInterface,
  RemoveOneInterface,
  UpdateOneInterface,
} from '@bitwild/rockets-common';

/**
 * Pet Appointment Status Enumeration
 */
export enum PetAppointmentStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

/**
 * Pet Appointment Interface
 * Defines the shape of pet appointment data
 */
export interface PetAppointmentInterface
  extends ReferenceIdInterface,
    AuditInterface {
  petId: string;
  appointmentDate: Date;
  appointmentType: string;
  veterinarian: string;
  status: PetAppointmentStatus;
  reason: string;
  notes?: string;
  diagnosis?: string;
  treatment?: string;
  pet?: import('../pet/pet.interface').PetEntityInterface; // Relation to PetEntity
}

/**
 * Pet Appointment Entity Interface
 * Defines the structure of the PetAppointment entity in the database
 */
export interface PetAppointmentEntityInterface
  extends PetAppointmentInterface {}

/**
 * Pet Appointment Creatable Interface
 * Defines what fields can be provided when creating an appointment
 */
export interface PetAppointmentCreatableInterface
  extends Pick<
      PetAppointmentInterface,
      | 'petId'
      | 'appointmentDate'
      | 'appointmentType'
      | 'veterinarian'
      | 'reason'
    >,
    Partial<
      Pick<
        PetAppointmentInterface,
        'status' | 'notes' | 'diagnosis' | 'treatment'
      >
    > {}

/**
 * Pet Appointment Updatable Interface
 * Defines what fields can be updated on an appointment
 */
export interface PetAppointmentUpdatableInterface
  extends Pick<PetAppointmentInterface, 'id'>,
    Partial<
      Pick<
        PetAppointmentInterface,
        | 'appointmentDate'
        | 'appointmentType'
        | 'veterinarian'
        | 'status'
        | 'reason'
        | 'notes'
        | 'diagnosis'
        | 'treatment'
      >
    > {}

/**
 * Pet Appointment Model Service Interface
 * Defines the contract for the PetAppointment model service
 */
export interface PetAppointmentModelServiceInterface
  extends ByIdInterface<string, PetAppointmentEntityInterface>,
    CreateOneInterface<
      PetAppointmentCreatableInterface,
      PetAppointmentEntityInterface
    >,
    UpdateOneInterface<
      PetAppointmentUpdatableInterface,
      PetAppointmentEntityInterface
    >,
    RemoveOneInterface<
      Pick<PetAppointmentEntityInterface, 'id'>,
      PetAppointmentEntityInterface
    > {
  findByPetId(petId: string): Promise<PetAppointmentEntityInterface[]>;
}
