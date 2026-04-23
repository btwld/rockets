import { Entity, PrimaryColumn } from 'typeorm';

/**
 * Maps the `pet_tag` junction table created by {@link PetEntity}'s
 * `@ManyToMany` / `@JoinTable`. Mutations here keep the join rows in sync
 * with `tagIds` on update while staying behind `RepositoryInterface`.
 */
@Entity('pet_tag')
export class PetTagEntity {
  @PrimaryColumn('uuid')
  petId!: string;

  @PrimaryColumn('uuid')
  tagId!: string;
}
