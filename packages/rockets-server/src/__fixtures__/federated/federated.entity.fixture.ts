import { Entity, ManyToOne } from 'typeorm';
import { ReferenceIdInterface } from '@concepta/nestjs-common';
import { FederatedSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserFixture } from '../user/user.entity.fixture';

/**
 * Federated Entity Fixture
 */
@Entity()
export class FederatedEntityFixture extends FederatedSqliteEntity {
  @ManyToOne(() => UserFixture)
  user!: ReferenceIdInterface;
}
