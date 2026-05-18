import { Entity, ManyToOne } from 'typeorm';
import { FederatedSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserEntity } from './user.entity';

@Entity('federated')
export class FederatedEntity extends FederatedSqliteEntity {
  @ManyToOne(() => UserEntity, (user) => user.federatedAccounts)
  assignee!: UserEntity;
}
