import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/**
 * SQLite audit columns shared by auth and domain tables in this sample.
 * App-owned entities declare columns explicitly instead of extending
 * deprecated `@concepta/nestjs-typeorm-ext` base classes.
 */
export abstract class AuditedSqliteEntity {
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
