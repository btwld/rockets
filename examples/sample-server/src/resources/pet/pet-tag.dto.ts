import { Exclude, Expose, Type } from 'class-transformer';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { TagResponseDto } from '../tag/tag.dto';

@Exclude()
export class PetTagDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  @IsNotEmpty()
  petId!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  @IsNotEmpty()
  tagId!: string;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateCreated!: Date;
}

/**
 * Body for `POST /pets/:petId/tags`. `petId` is taken from the URL path
 * by `PetTagPathScopeHook`, never from the body — only `tagId` is
 * client-controlled.
 */
export class PetTagCreateDto extends PickType(PetTagDto, ['tagId'] as const) {}

export class PetTagResponseDto extends PetTagDto {
  /**
   * Eager-loaded tag preview. Removes the need for clients to call
   * `GET /tags/:id` after listing pet tags.
   */
  @Expose()
  @Type(() => TagResponseDto)
  @ApiProperty({ type: TagResponseDto, required: false })
  tag?: TagResponseDto;
}
