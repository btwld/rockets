import {
  Column,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';

import { UserFixture } from './user.entity.fixture';

/**
 * User UserMetadata Entity Fixture
 */
@Entity()
export class UserMetadataEntityFixture {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  userId!: string;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;

  @Column({ type: 'datetime', nullable: true })
  dateDeleted!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @OneToOne(() => UserFixture, (user) => user.userMetadata)
  @JoinColumn({ name: 'userId' })
  user!: UserFixture;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  username?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'integer', nullable: true })
  age?: number;
}
