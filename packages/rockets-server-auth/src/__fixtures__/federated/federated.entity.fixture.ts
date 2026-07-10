import { Column, Entity, ManyToOne } from 'typeorm';
import { ReferenceIdInterface } from '@concepta/nestjs-core';
import { AuditedSqliteEntityFixture } from '../persistence/audited-sqlite.entity.fixture';
import { UserFixture } from '../user/user.entity.fixture';

@Entity()
export class FederatedEntityFixture extends AuditedSqliteEntityFixture {
  @Column()
  provider!: string;

  @Column()
  subject!: string;

  @ManyToOne(() => UserFixture)
  user!: ReferenceIdInterface;
}
