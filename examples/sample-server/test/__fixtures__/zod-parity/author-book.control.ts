import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { defineResource } from '@bitwild/rockets';

/**
 * Handwritten CONTROL twin of the zod author/book pair
 * (author-book.zod.ts): classic TypeORM entities + decorator DTOs +
 * defineResource. The parity e2e boots one app per style and asserts
 * the wire contract and runtime behavior match.
 *
 * Projection rules mirrored here by hand (the zod twin derives them
 * from field meta):
 * - `isbn`        — create-only (immutable): absent from the update DTO.
 * - `internalNote` — write-only: absent from the response DTO.
 * - `authorId`    — FK; response additionally exposes the nested
 *                   `author` object (eager ManyToOne).
 */
@Entity('authors')
export class AuthorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name!: string;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;
}

@Entity('books')
export class BookEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200, nullable: false })
  title!: string;

  @Column({ type: 'varchar', length: 20, nullable: false })
  isbn!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  internalNote?: string;

  @Index()
  @Column({ type: 'uuid', nullable: false })
  authorId!: string;

  @ManyToOne(() => AuthorEntity, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author?: AuthorEntity;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;

  @DeleteDateColumn()
  dateDeleted?: Date | null;
}

@Exclude()
export class AuthorResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateCreated!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateUpdated!: Date;
}

@Exclude()
export class AuthorCreateDto {
  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

@Exclude()
export class AuthorUpdateDto {
  @Expose() @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() id?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}

@Exclude()
export class BookResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Expose()
  @ApiProperty()
  @IsString()
  @MaxLength(20)
  isbn!: string;

  @Expose() @ApiProperty({ format: 'uuid' }) @IsUUID() authorId!: string;

  @Expose()
  @ApiPropertyOptional({ type: AuthorResponseDto })
  @Type(() => AuthorResponseDto)
  author?: AuthorResponseDto;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateCreated!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateUpdated!: Date;

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  dateDeleted?: Date | null;
}

@Exclude()
export class BookCreateDto {
  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Expose()
  @ApiProperty()
  @IsString()
  @MaxLength(20)
  isbn!: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNote?: string;

  @Expose() @ApiProperty({ format: 'uuid' }) @IsUUID() authorId!: string;
}

@Exclude()
export class BookUpdateDto {
  @Expose() @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() id?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNote?: string;

  @Expose() @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() authorId?: string;
}

export const authorControlResource = defineResource({
  entity: AuthorEntity,
  operations: {
    list: { output: AuthorResponseDto },
    read: { output: AuthorResponseDto },
    create: { input: AuthorCreateDto, output: AuthorResponseDto },
    update: { input: AuthorUpdateDto, output: AuthorResponseDto },
    delete: {},
  },
});

export class BookReplaceDto extends BookCreateDto {}

export const bookControlResource = defineResource({
  entity: BookEntity,
  operations: {
    list: { output: BookResponseDto },
    read: { output: BookResponseDto },
    create: { input: BookCreateDto, output: BookResponseDto },
    update: { input: BookUpdateDto, output: BookResponseDto },
    replace: { input: BookReplaceDto, output: BookResponseDto },
    delete: { soft: true, returnDeleted: true },
    restore: { returnRestored: true },
  },
});
