import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReminderEntity } from './reminder.entity';

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

@Entity('appointments')
export class AppointmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  petId!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  userId!: string;

  @Column({ type: 'datetime', nullable: false })
  date!: Date;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: false,
    default: AppointmentStatus.PENDING,
  })
  status!: AppointmentStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  dateCreated!: Date;

  @OneToMany(() => ReminderEntity, (r) => r.appointment, { eager: true })
  reminders!: ReminderEntity[];
}
