import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PetEntity } from './pet.entity';
import { TagEntity } from '../tag/tag.entity';

/**
 * Explicit junction entity between {@link PetEntity} and {@link TagEntity}.
 *
 * Modeled as a first-class entity (own UUID id + UNIQUE on the pair)
 * instead of an implicit TypeORM `@JoinTable`, so the M:N relation can
 * be exposed as plain CRUD endpoints (`/pets/:petId/tags`) — add /
 * remove become standard `Create` / `Delete` operations driven by
 * declarative resources, no inline `tagIds` arrays on the parent
 * payload, no syncer, no handler overrides.
 */
@Entity('pet_tag')
@Unique(['petId', 'tagId'])
export class PetTagEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: false })
  petId!: string;

  @Index()
  @Column({ type: 'uuid', nullable: false })
  tagId!: string;

  @ManyToOne(() => PetEntity, (pet) => pet.petTags, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'petId' })
  pet?: PetEntity;

  /**
   * Eager-loaded so {@link PetEntity} can project a flat `tags`
   * collection into its response DTO without a separate query.
   */
  @ManyToOne(() => TagEntity, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tagId' })
  tag?: TagEntity;

  @CreateDateColumn()
  dateCreated!: Date;
}
