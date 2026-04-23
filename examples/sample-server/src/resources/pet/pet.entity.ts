import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PetVaccinationEntity } from '../pet-vaccination/pet-vaccination.entity';
import { TagEntity } from '../tag/tag.entity';

export enum PetStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('pets')
export class PetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  species!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  breed?: string;

  @Column({ type: 'int', nullable: false })
  age!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  color?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 20, default: PetStatus.ACTIVE, nullable: false })
  status!: PetStatus;

  @Column({ type: 'varchar', length: 255, nullable: false })
  userId!: string;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;

  /**
   * Soft-delete timestamp. `@DeleteDateColumn` wires this into TypeORM's
   * native soft-delete support: repository.softDelete() sets it,
   * repository.restore() clears it, and every `find` call filters out
   * rows where it is non-null (unless `withDeleted: true` is passed).
   */
  @DeleteDateColumn({ type: 'datetime', nullable: true })
  dateDeleted!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @OneToMany(() => PetVaccinationEntity, (v) => v.pet, { eager: true })
  vaccinations!: PetVaccinationEntity[];

  @ManyToMany(() => TagEntity, (tag) => tag.pets, {
    eager: true,
    cascade: ['insert', 'update'],
  })
  @JoinTable({
    name: 'pet_tag',
    joinColumn: { name: 'petId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags!: TagEntity[];
}
