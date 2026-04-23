import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum PetSharePermission {
  READ = 'read',
  // Write intentionally omitted — shared-user writes are out of scope for
  // the sample app. Extend here if the product later allows it.
}

/**
 * Join row recording "user X has been granted access to pet Y by pet's
 * owner". Unlike `pet_tag` (an implicit TypeORM @JoinTable junction), this
 * is an explicit entity with its own id, created-at, and permission level —
 * it's queried directly by `PetOwnerOrSharedHook` to broaden read/list
 * scoping, and managed via the dedicated `PetShareController` endpoints.
 */
@Entity('pet_share')
@Unique(['petId', 'userId'])
export class PetShareEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: false })
  petId!: string;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: false })
  userId!: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: false,
    default: PetSharePermission.READ,
  })
  permission!: PetSharePermission;

  @CreateDateColumn()
  dateCreated!: Date;
}
