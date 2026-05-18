import { Entity } from 'typeorm';
import { RoleSqliteEntity } from '@concepta/nestjs-typeorm-ext';

@Entity('role')
export class RoleEntity extends RoleSqliteEntity {}
