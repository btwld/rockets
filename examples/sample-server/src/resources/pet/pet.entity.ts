import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PetVaccinationEntity } from '../pet-vaccination/pet-vaccination.entity';
import { PetTagEntity } from './pet-tag.entity';

export enum PetStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('pets')
export class PetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Optional external reference, globally unique when set (SQLite allows
   * multiple NULLs on a UNIQUE column). Checked in `PetCreateHandler`
   * before insert; the column still enforces uniqueness at persistence time.
   */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  uniqueRef?: string | null;

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

  @Column({
    type: 'varchar',
    length: 20,
    default: PetStatus.ACTIVE,
    nullable: false,
  })
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

  /**
   * Eager-loaded join rows. The flat `tags: TagEntity[]` shape used by
   * {@link PetResponseDto} is projected from this collection in the DTO
   * via `class-transformer`. Mutations go through the dedicated junction
   * resource (`/pets/:petId/tags`), never the parent payload.
   */
  @OneToMany(() => PetTagEntity, (pt) => pt.pet, { eager: true })
  petTags!: PetTagEntity[];
}
