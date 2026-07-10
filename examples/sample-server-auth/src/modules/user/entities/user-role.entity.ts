import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AuditedSqliteEntity } from '../../../shared/persistence/audited-sqlite.entity';
import { UserEntity } from './user.entity';
import { RoleEntity } from '../../role/role.entity';

@Entity('user_role')
@Unique(['roleId', 'assigneeId'])
export class UserRoleEntity extends AuditedSqliteEntity {
  @Column({ type: 'uuid' })
  roleId!: string;

  @Column({ type: 'uuid' })
  assigneeId!: string;

  @ManyToOne(() => UserEntity, (user) => user.userRoles)
  @JoinColumn({ name: 'assigneeId' })
  user!: UserEntity;

  @ManyToOne(() => RoleEntity, { eager: true })
  @JoinColumn({ name: 'roleId' })
  role!: RoleEntity;
}
