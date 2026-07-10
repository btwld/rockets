import { Column, Entity } from 'typeorm';
import { AuditedSqliteEntityFixture } from '../persistence/audited-sqlite.entity.fixture';

@Entity()
export class UserPasswordHistoryEntityFixture extends AuditedSqliteEntityFixture {
  @Column({ type: 'text', nullable: true })
  passwordHash?: string;

  @Column({ type: 'text', nullable: true })
  passwordSalt?: string;

  @Column({ type: 'uuid' })
  userId!: string;
}
