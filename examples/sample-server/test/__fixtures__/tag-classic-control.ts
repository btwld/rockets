import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude, Expose } from 'class-transformer';
import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { defineResource } from '@bitwild/rockets';

/**
 * Handwritten (classic) tag control — the comparison baseline for
 * `zod-swagger-golden.e2e-spec.ts`, which boots this control app beside
 * the zod-driven `/tags` and asserts the generated Swagger is identical.
 *
 * It lives here (test fixture) — NOT in `src` — because the sample app is
 * 100% zod; the classic surface only exists to PROVE the zod compiler
 * reproduces it. Mirrors `__fixtures__/zod-parity/author-book.control`.
 */
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

@Exclude()
export class TagDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ example: 'vaccinated' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Expose()
  @ApiPropertyOptional({ example: '#ff0000' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateCreated!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateUpdated!: Date;
}

export class TagCreateDto extends PickType(TagDto, ['name', 'color'] as const) {}

export class TagUpdateDto extends IntersectionType(
  PickType(TagDto, ['id'] as const),
  PartialType(PickType(TagDto, ['name', 'color'] as const)),
) {}

export class TagResponseDto extends TagDto {}

/**
 * Shared global catalog — no owner scoping. Mirrors the zod `tagZodResource`
 * surface so the golden test can diff the two Swagger documents.
 */
export const tagResource = defineResource({
  entity: TagEntity,
  operations: {
    list: { output: TagResponseDto },
    read: { output: TagResponseDto },
    create: { input: TagCreateDto, output: TagResponseDto },
    update: { input: TagUpdateDto, output: TagResponseDto },
  },
});
