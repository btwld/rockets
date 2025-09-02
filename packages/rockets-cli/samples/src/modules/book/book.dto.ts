import { Exclude, Expose, Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { CommonEntityDto } from '@concepta/nestjs-common';
import { CrudResponsePaginatedDto } from '@concepta/nestjs-crud';
import { BookInterface, BookCreatableInterface, BookUpdatableInterface, BookStatus } from './book.interface';

@Exclude()
export class BookDto extends CommonEntityDto implements BookInterface {
  @Expose()
  @ApiProperty({ description: 'Book name', example: 'Sample Book', maxLength: 255, minLength: 1 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @Expose()
  @ApiProperty({ description: 'Book status', example: BookStatus.ACTIVE, enum: BookStatus })
  @IsEnum(BookStatus)
  status!: BookStatus;

  @Expose()
  @ApiProperty({ description: 'title', required: true })
  
  
  @IsNotEmpty()
  @IsString()
  
  
  title!: string;
  @Expose()
  @ApiProperty({ description: 'subtitle', required: false })
  @IsOptional()
  
  
  @IsString()
  
  
  subtitle?: string;
  @Expose()
  @ApiProperty({ description: 'category', required: true })
  
  
  @IsNotEmpty()
  @IsString()
  
  
  category!: string;
}

export class BookCreateDto extends PickType(BookDto, ['name', 'status', 'title', 'category'] as const) implements BookCreatableInterface {}

export class BookUpdateDto extends PickType(BookDto, ['id', 'name', 'status', 'title', 'subtitle', 'category'] as const) implements BookUpdatableInterface {}

export class BookPaginatedDto extends CrudResponsePaginatedDto<BookDto> {
  @ApiProperty({ type: [BookDto], description: 'Array of books' })
  data!: BookDto[];
}


