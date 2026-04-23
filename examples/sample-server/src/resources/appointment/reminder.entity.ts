import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AppointmentEntity } from './appointment.entity';

@Entity('reminders')
export class ReminderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  appointmentId!: string;

  @Column({ type: 'datetime', nullable: false })
  sendAt!: Date;

  @Column({ type: 'boolean', default: false, nullable: false })
  sent!: boolean;

  @CreateDateColumn()
  dateCreated!: Date;

  @ManyToOne(() => AppointmentEntity, (a) => a.reminders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'appointmentId' })
  appointment!: AppointmentEntity;
}
