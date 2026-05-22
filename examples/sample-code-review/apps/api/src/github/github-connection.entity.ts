import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('github_connections')
export class GithubConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Firebase `uid` / `AuthorizedUser.id` */
  @Column({ type: 'varchar', length: 128, unique: true })
  userId!: string;

  @Column({ type: 'varchar', length: 128 })
  githubLogin!: string;

  @Column({ type: 'text' })
  accessToken!: string;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;
}
