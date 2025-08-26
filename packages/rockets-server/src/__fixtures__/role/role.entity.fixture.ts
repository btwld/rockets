import { Entity, OneToMany } from 'typeorm';
import { RoleSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserRoleEntityFixture } from './user-role.entity.fixture';

@Entity('role')
export class RoleEntityFixture extends RoleSqliteEntity {
  @OneToMany(() => UserRoleEntityFixture, (userRole) => userRole.role)
  userRoles?: UserRoleEntityFixture[];
}
