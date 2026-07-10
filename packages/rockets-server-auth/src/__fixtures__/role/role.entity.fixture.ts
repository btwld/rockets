import { Column, Entity, OneToMany } from 'typeorm';
import { AuditedSqliteEntityFixture } from '../persistence/audited-sqlite.entity.fixture';
import { UserRoleEntityFixture } from './user-role.entity.fixture';

@Entity('role')
export class RoleEntityFixture extends AuditedSqliteEntityFixture {
  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @OneToMany(() => UserRoleEntityFixture, (userRole) => userRole.role)
  userRoles?: UserRoleEntityFixture[];
}
