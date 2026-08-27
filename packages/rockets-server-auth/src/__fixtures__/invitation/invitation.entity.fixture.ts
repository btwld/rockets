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

  // Upstream v8 derives `active` / `isAccepted` / `isRevoked` from these two
  // dates; an entity without them loads `undefined`, which reads as "accepted".
  @Column({ type: 'datetime', nullable: true, default: null })
  dateAccepted!: Date | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  dateRevoked!: Date | null;
}
