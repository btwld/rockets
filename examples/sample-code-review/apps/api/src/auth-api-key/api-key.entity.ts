import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Stores API keys for programmatic access (e.g., CI/CD pipelines).
 *
 * ⚠️ SAMPLE CODE — in production, store a bcrypt/argon2 hash of the
 * key rather than plaintext, and compare with the library's verify
 * function (constant-time). Only reveal the raw key once, at creation.
 */
@Entity('api_keys')
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Raw key value — shown once at creation, then only the prefix is exposed. */
  @Column({ type: 'varchar', length: 64, unique: true })
  key!: string;

  /** ID of the owning user (maps to the Firebase uid via UserEntity). */
  @Column({ type: 'varchar', length: 255 })
  userId!: string;

  /** Human-readable label so users can identify which key is which. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name?: string;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt?: Date;

  @CreateDateColumn()
  dateCreated!: Date;
}
