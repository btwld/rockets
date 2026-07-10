import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/** Audit columns for e2e fixture entities (mirrors sample-server-auth). */
export abstract class AuditedSqliteEntityFixture {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'datetime' })
  dateCreated!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  dateUpdated!: Date;

  @DeleteDateColumn({ type: 'datetime' })
  dateDeleted!: Date | null;

  @VersionColumn({ type: 'integer' })
  version!: number;
}
