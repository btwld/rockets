import { Exclude, Expose, Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { CommonEntityDto } from '@concepta/nestjs-common';
import { CrudResponsePaginatedDto } from '@concepta/nestjs-crud';
import { NoteInterface, NoteCreatableInterface, NoteUpdatableInterface, NoteStatus } from './note.interface';

@Exclude()
export class NoteDto extends CommonEntityDto implements NoteInterface {
  @Expose()
  @ApiProperty({ description: 'Note name', example: 'Sample Note', maxLength: 255, minLength: 1 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @Expose()
  @ApiProperty({ description: 'Note status', example: NoteStatus.ACTIVE, enum: NoteStatus })
  @IsEnum(NoteStatus)
  status!: NoteStatus;

  @Expose()
  @ApiProperty({ description: 'title', required: true })
  
  
  @IsNotEmpty()
  @IsString()
  
  
  title!: string;
  @Expose()
  @ApiProperty({ description: 'content', required: false })
  @IsOptional()
  
  
  @IsString()
  
  
  content?: string;
}

export class NoteCreateDto extends PickType(NoteDto, ['name', 'status', 'title'] as const) implements NoteCreatableInterface {}

export class NoteUpdateDto extends PickType(NoteDto, ['id', 'name', 'status', 'title', 'content'] as const) implements NoteUpdatableInterface {}

export class NotePaginatedDto extends CrudResponsePaginatedDto<NoteDto> {
  @ApiProperty({ type: [NoteDto], description: 'Array of notes' })
  data!: NoteDto[];
}


