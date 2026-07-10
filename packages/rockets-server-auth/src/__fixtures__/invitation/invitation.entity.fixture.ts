import { Column, Entity } from 'typeorm';
import { AuditedSqliteEntityFixture } from '../persistence/audited-sqlite.entity.fixture';

@Entity()
export class InvitationEntityFixture extends AuditedSqliteEntityFixture {
  @Column('boolean', { default: true })
  active!: boolean;

  @Column()
  code!: string;

  @Column()
  category!: string;

  @Column({ type: 'simple-json', nullable: true })
  constraints?: object;

  @Column({ type: 'uuid' })
  userId!: string;
}
