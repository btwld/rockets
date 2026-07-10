import { Column, Entity, ManyToOne } from 'typeorm';
import { AuditedSqliteEntity } from '../../../shared/persistence/audited-sqlite.entity';
import { UserEntity } from './user.entity';

@Entity('user_otp')
export class UserOtpEntity extends AuditedSqliteEntity {
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

  @ManyToOne(() => UserEntity, (user) => user.userOtps)
  assignee!: UserEntity;
}
