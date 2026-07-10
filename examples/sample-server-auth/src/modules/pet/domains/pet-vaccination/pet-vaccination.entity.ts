import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditedSqliteEntity } from '../../../../shared/persistence/audited-sqlite.entity';
import { PetVaccinationEntityInterface } from './pet-vaccination.interface';
import type { PetEntity } from '../pet/pet.entity';

@Entity('pet_vaccinations')
export class PetVaccinationEntity
  extends AuditedSqliteEntity
  implements PetVaccinationEntityInterface
{
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
