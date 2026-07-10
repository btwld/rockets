import { Column, Entity, OneToMany, OneToOne } from 'typeorm';
import { AuditedSqliteEntity } from '../../../shared/persistence/audited-sqlite.entity';
import { UserOtpEntity } from './user-otp.entity';
import { FederatedEntity } from './federated.entity';
import { UserMetadataEntity } from './user-metadata.entity';
import { UserRoleEntity } from './user-role.entity';

@Entity('user')
export class UserEntity extends AuditedSqliteEntity {
  @Column({ unique: true })
  email!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'text', nullable: true })
  passwordHash?: string;

  @Column({ type: 'text', nullable: true })
  passwordSalt?: string;

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

  @OneToOne(() => UserMetadataEntity, (userMetadata) => userMetadata.user, {
    cascade: true,
    eager: true,
  })
  userMetadata?: UserMetadataEntity;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.user, {
    eager: true,
  })
  userRoles?: UserRoleEntity[];
}
