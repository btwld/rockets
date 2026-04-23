import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  SOFT_DELETE = 'soft_delete',
  RESTORE = 'restore',
}

@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Auth-user id that triggered the write. `null` for system / anonymous. */
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: false })
  action!: AuditAction;

  /** Resource key (e.g. 'pet'). */
  @Index()
  @Column({ type: 'varchar', length: 100, nullable: false })
  resource!: string;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  resourceId!: string | null;

  /**
   * JSON-encoded snapshot of the post-write entity. Stored as text rather
   * than `@Column({type:'json'})` so this works unchanged against SQLite
   * (tests) and postgres/mysql.
   */
  @Column({ type: 'text', nullable: true })
  snapshot!: string | null;

  @CreateDateColumn()
  dateCreated!: Date;
}
