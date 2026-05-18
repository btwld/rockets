import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CommonSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { PetVaccinationEntityInterface } from './pet-vaccination.interface';
import type { PetEntity } from '../pet/pet.entity';

/**
 * Pet Vaccination Entity
 *
 * Tracks vaccination records for pets including:
 * - Vaccine name and administration date
 * - Next due date for follow-up vaccinations
 * - Veterinarian who administered the vaccine
 * - Batch number and notes for record keeping
 */
@Entity('pet_vaccinations')
export class PetVaccinationEntity
  extends CommonSqliteEntity
  implements PetVaccinationEntityInterface
{
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  petId!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  vaccineName!: string;

  @Column({ type: 'datetime', nullable: false })
  administeredDate!: Date;

  @Column({ type: 'datetime', nullable: true })
  nextDueDate?: Date;

  @Column({ type: 'varchar', length: 255, nullable: false })
  veterinarian!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  batchNumber?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne('PetEntity', 'vaccinations')
  @JoinColumn({ name: 'petId' })
  pet?: PetEntity;
}
