import { Entity, ManyToOne } from 'typeorm';
import { OtpSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserEntity } from './user.entity';

@Entity('user_otp')
export class UserOtpEntity extends OtpSqliteEntity {
  @ManyToOne(() => UserEntity, (user) => user.userOtps)
  assignee!: UserEntity;
}
