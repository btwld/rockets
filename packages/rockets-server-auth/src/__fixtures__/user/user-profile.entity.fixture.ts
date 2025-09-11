import { Column, Entity, OneToOne } from 'typeorm';

import { UserFixture } from './user.entity.fixture';
import { UserProfileSqliteEntity } from '@concepta/nestjs-typeorm-ext';

/**
 * User Profile Entity Fixture
 */
@Entity()
export class UserProfileEntityFixture extends UserProfileSqliteEntity {
  @OneToOne(() => UserFixture, (user) => user.userProfile)
  user!: UserFixture;

  @Column({ nullable: true })
  firstName!: string;
}
