import { Column, Entity } from 'typeorm';
import { ReferenceActive } from '@concepta/nestjs-core';
import { AuditedSqliteEntityFixture } from '../persistence/audited-sqlite.entity.fixture';

@Entity()
export class UserCredentialEntityFixture extends AuditedSqliteEntityFixture {
  @Column({ type: 'text', nullable: true })
  passwordHash?: string;

  @Column({ type: 'text', nullable: true })
  passwordSalt?: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'boolean', default: true })
  active!: ReferenceActive;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  validFrom!: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  validTo!: Date | null;
}
