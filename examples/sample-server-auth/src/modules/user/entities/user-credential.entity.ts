import { Column, Entity } from 'typeorm';
import { ReferenceActive } from '@concepta/nestjs-core';
import { AuditedSqliteEntity } from '../../../shared/persistence/audited-sqlite.entity';

/** Password credentials row for `@concepta/nestjs-user` v8 (`CreateUserCredentialCommand`). */
@Entity()
export class UserCredentialEntity extends AuditedSqliteEntity {
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
