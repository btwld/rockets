import { Entity, Column, OneToMany } from 'typeorm';
import { UserSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserOtpEntity } from './user-otp.entity';
import { FederatedEntity } from './federated.entity';

@Entity('user')
export class UserEntity extends UserSqliteEntity {
  @Column({ type: 'integer', nullable: true })
  age?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];

  @Column({ type: 'boolean', default: false })
  isVerified?: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt?: Date;

  @OneToMany(() => UserOtpEntity, (userOtp) => userOtp.assignee)
  userOtps?: UserOtpEntity[];
  
  @OneToMany(() => FederatedEntity, (federated) => federated.assignee)
  federatedAccounts?: FederatedEntity[];
}