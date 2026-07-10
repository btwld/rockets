import { Column, Entity, ManyToOne } from 'typeorm';
import { ReferenceIdInterface } from '@concepta/nestjs-core';
import { AuditedSqliteEntityFixture } from '../persistence/audited-sqlite.entity.fixture';
import { UserFixture } from './user.entity.fixture';

@Entity()
export class UserOtpEntityFixture extends AuditedSqliteEntityFixture {
  @Column()
  category!: string;

  @Column({ nullable: true })
  type?: string;

  @Column()
  passcode!: string;

  @Column({ type: 'datetime' })
  expirationDate!: Date;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'uuid' })
  assigneeId!: string;

  @ManyToOne(() => UserFixture, (user) => user.userOtps)
  assignee!: ReferenceIdInterface;
}
