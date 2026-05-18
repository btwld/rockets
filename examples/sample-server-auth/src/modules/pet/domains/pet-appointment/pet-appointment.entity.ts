import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CommonSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import {
  PetAppointmentEntityInterface,
  PetAppointmentStatus,
} from './pet-appointment.interface';
import type { PetEntity } from '../pet/pet.entity';

/**
 * Pet Appointment Entity
 *
 * Tracks appointment records for pets including:
 * - Appointment date and type (checkup, surgery, etc.)
 * - Veterinarian and reason for visit
 * - Status tracking (scheduled, completed, cancelled, no-show)
 * - Diagnosis and treatment notes
 */
@Entity('pet_appointments')
export class PetAppointmentEntity
  extends CommonSqliteEntity
  implements PetAppointmentEntityInterface
{
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  petId!: string;

  @Column({ type: 'datetime', nullable: false })
  appointmentDate!: Date;

  @Column({ type: 'varchar', length: 100, nullable: false })
  appointmentType!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  veterinarian!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: PetAppointmentStatus.SCHEDULED,
    nullable: false,
  })
  status!: PetAppointmentStatus;

  @Column({ type: 'text', nullable: false })
  reason!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  diagnosis?: string;

  @Column({ type: 'text', nullable: true })
  treatment?: string;

  @ManyToOne('PetEntity', 'appointments')
  @JoinColumn({ name: 'petId' })
  pet?: PetEntity;
}
