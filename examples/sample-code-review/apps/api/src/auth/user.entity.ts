import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Local user row keyed by Firebase `uid` (see resolver / metadata `userId`).
 * No password flow — identity comes from Firebase tokens.
 */
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name?: string;

  @CreateDateColumn()
  dateCreated!: Date;
}
