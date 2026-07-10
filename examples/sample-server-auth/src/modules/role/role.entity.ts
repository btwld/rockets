import { Column, Entity } from 'typeorm';
import { AuditedSqliteEntity } from '../../shared/persistence/audited-sqlite.entity';

@Entity('role')
export class RoleEntity extends AuditedSqliteEntity {
  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;
}
