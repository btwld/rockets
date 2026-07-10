import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ReferenceIdInterface } from '@concepta/nestjs-core';
import { RoleInterface } from '@concepta/nestjs-role';
import { AuditedSqliteEntityFixture } from '../persistence/audited-sqlite.entity.fixture';
import { RoleEntityFixture } from './role.entity.fixture';
import { UserFixture } from '../user/user.entity.fixture';

@Entity('user_role')
@Unique(['roleId', 'assigneeId'])
export class UserRoleEntityFixture extends AuditedSqliteEntityFixture {
  @Column({ type: 'uuid' })
  roleId!: string;

  @Column({ type: 'uuid' })
  assigneeId!: string;

  @ManyToOne(() => RoleEntityFixture, (role) => role.userRoles, {
    nullable: false,
  })
  @JoinColumn({ name: 'roleId' })
  role!: RoleInterface;

  @ManyToOne(() => UserFixture, (user) => user.userRoles, { nullable: false })
  @JoinColumn({ name: 'assigneeId' })
  assignee!: ReferenceIdInterface;
}
