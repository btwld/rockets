import { Column, Entity, ManyToOne } from 'typeorm';
import { AuditedSqliteEntity } from '../../../shared/persistence/audited-sqlite.entity';
import { UserEntity } from './user.entity';

@Entity('federated')
export class FederatedEntity extends AuditedSqliteEntity {
  @Column()
  provider!: string;

  @Column()
  subject!: string;

  @ManyToOne(() => UserEntity, (user) => user.federatedAccounts)
  assignee!: UserEntity;
}
