import { Entity, ManyToOne } from 'typeorm';
import { ReferenceIdInterface } from '@bitwild/rockets-app';
import { RoleInterface } from '@concepta/nestjs-role';
import { RoleAssignmentSqliteEntity } from '@concepta/nestjs-typeorm-ext';

import { RoleEntityFixture } from './role.entity.fixture';
import { UserFixture } from '../user/user.entity.fixture';

@Entity('user_role')
export class UserRoleEntityFixture extends RoleAssignmentSqliteEntity {
  @ManyToOne(() => RoleEntityFixture, (role) => role.userRoles, {
    nullable: false,
  })
  role!: RoleInterface;

  @ManyToOne(() => UserFixture, (user) => user.userRoles, { nullable: false })
  assignee!: ReferenceIdInterface;
}
