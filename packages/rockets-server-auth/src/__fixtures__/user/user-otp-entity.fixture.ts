import { Entity, ManyToOne } from 'typeorm';
import { ReferenceIdInterface } from '@concepta/nestjs-common';
import { OtpSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserFixture } from './user.entity.fixture';

/**
 * Otp Entity Fixture
 */
@Entity()
export class UserOtpEntityFixture extends OtpSqliteEntity {
  @ManyToOne(() => UserFixture, (user) => user.userOtps)
  assignee!: ReferenceIdInterface;
}
