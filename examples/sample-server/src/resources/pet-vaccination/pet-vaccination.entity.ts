import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PetEntity } from '../pet/pet.entity';

@Entity('pet_vaccinations')
export class PetVaccinationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name!: string;

  @Column({ type: 'date', nullable: false })
  dateAdministered!: string;

  @Column({ type: 'date', nullable: true })
  dateExpires?: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  petId!: string;

  @ManyToOne(() => PetEntity, (pet) => pet.vaccinations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'petId' })
  pet!: PetEntity;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;
}
