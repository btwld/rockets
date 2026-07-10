import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditedSqliteEntity } from '../../../../shared/persistence/audited-sqlite.entity';
import {
  PetAppointmentEntityInterface,
  PetAppointmentStatus,
} from './pet-appointment.interface';
import type { PetEntity } from '../pet/pet.entity';

@Entity('pet_appointments')
export class PetAppointmentEntity
  extends AuditedSqliteEntity
  implements PetAppointmentEntityInterface
{
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
