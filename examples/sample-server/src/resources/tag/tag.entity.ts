import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tags')
export class TagEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, nullable: false, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color?: string;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;
}
