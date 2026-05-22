import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CodeReviewEngine } from './code-review-report.types';

@Entity('code_review_report_executions')
export class CodeReviewReportExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  reportId!: string;

  @Index('code_review_report_executions_user_id_idx')
  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Column({ type: 'varchar', length: 128 })
  githubLogin!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reviewEngine!: CodeReviewEngine | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  reviewModel!: string | null;

  @Column({ type: 'varchar', length: 255 })
  defaultBranch!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  repositoryLanguage!: string | null;

  @Column({ type: 'int', default: 0 })
  sourceFilesCount!: number;

  @Column({ type: 'boolean', default: false })
  sourceFilesTruncated!: boolean;

  @Column({ type: 'int', nullable: true })
  durationMs!: number | null;

  @Column({ type: 'datetime', nullable: true })
  dateCompleted!: Date | null;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;
}
