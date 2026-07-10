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
}
