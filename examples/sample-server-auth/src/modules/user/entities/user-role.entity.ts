import { Entity, ManyToOne } from 'typeorm';
import { RoleAssignmentSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserEntity } from './user.entity';
import { RoleEntity } from '../../role/role.entity';

@Entity('user_role')
export class UserRoleEntity extends RoleAssignmentSqliteEntity {
  @ManyToOne(() => UserEntity)
  user!: UserEntity;

  @ManyToOne(() => RoleEntity, { eager: true })
  role!: RoleEntity;
}
