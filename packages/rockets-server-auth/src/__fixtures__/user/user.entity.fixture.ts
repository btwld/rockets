import { Column, Entity, OneToMany, OneToOne } from 'typeorm';
import { AuditedSqliteEntityFixture } from '../persistence/audited-sqlite.entity.fixture';
import { UserMetadataEntityFixture } from './user-metadata.entity.fixture';
import { UserOtpEntityFixture } from './user-otp-entity.fixture';
import { UserRoleEntityFixture } from '../role/user-role.entity.fixture';

@Entity()
export class UserFixture extends AuditedSqliteEntityFixture {
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

  @OneToOne(
    () => UserMetadataEntityFixture,
    (userMetadata) => userMetadata.user,
  )
  userMetadata?: UserMetadataEntityFixture;

  @OneToMany(() => UserOtpEntityFixture, (userOtp) => userOtp.assignee)
  userOtps?: UserOtpEntityFixture[];

  @OneToMany(() => UserRoleEntityFixture, (userRole) => userRole.assignee)
  userRoles?: UserRoleEntityFixture[];
}
