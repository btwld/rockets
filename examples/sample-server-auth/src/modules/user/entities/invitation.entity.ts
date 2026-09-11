import { Column, Entity } from 'typeorm';
import { AuditedSqliteEntity } from '../../../shared/persistence/audited-sqlite.entity';

@Entity()
export class InvitationEntity extends AuditedSqliteEntity {
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
