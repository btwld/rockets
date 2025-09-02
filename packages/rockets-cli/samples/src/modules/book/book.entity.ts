import { Entity, Column, Index } from 'typeorm';
import { CommonPostgresEntity } from '@concepta/nestjs-typeorm-ext';
import { BookEntityInterface, BookStatus } from './book.interface';

@Entity('book')
@Index('IDX_BOOK_NAME', ['name'], { unique: true })
@Index('IDX_BOOK_STATUS', ['status'])
export class BookEntity
  extends CommonPostgresEntity
  implements BookEntityInterface
{
  @Column({ type: 'varchar', length: 255, nullable: false })
  
  
  
  title!: string;
  @Column({ type: 'varchar', length: 255, nullable: true })
  
  
  
  subtitle?: string;
  @Column({ type: 'varchar', length: 255, nullable: false })
  
  
  
  category!: string;
}


