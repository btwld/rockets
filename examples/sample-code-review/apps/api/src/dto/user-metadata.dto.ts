import { Exclude, Expose } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import {
  BaseUserMetadataDto,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets';

@Exclude()
export class UserMetadataDto extends BaseUserMetadataDto {
  @Expose()
  @ApiPropertyOptional({ example: 'Thiago', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'Ramalho', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;
}

export class UserMetadataCreateDto
  extends PickType(UserMetadataDto, ['firstName', 'lastName'] as const)
  implements UserMetadataCreatableInterface
{
  @ApiProperty({ example: 'firebase-user' })
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class UserMetadataUpdateDto
  extends PartialType(
    PickType(UserMetadataDto, ['firstName', 'lastName'] as const),
  )
  implements UserMetadataModelUpdatableInterface
{
  @ApiProperty({ example: 'metadata-uuid' })
  @IsString()
  @IsNotEmpty()
  id!: string;
}
