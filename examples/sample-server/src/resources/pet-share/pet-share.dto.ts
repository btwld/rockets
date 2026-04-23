import { Exclude, Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PetSharePermission } from './pet-share.entity';

@Exclude()
export class PetShareResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() petId!: string;
  @Expose() @ApiProperty() userId!: string;

  @Expose()
  @ApiProperty({ enum: PetSharePermission })
  permission!: PetSharePermission;

  @Expose() @ApiProperty() dateCreated!: Date;
}

export class PetShareCreateDto {
  @ApiProperty({
    format: 'uuid',
    description: 'ID of the user the pet is being shared with.',
  })
  @IsUUID('4')
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({ enum: PetSharePermission })
  @IsOptional()
  @IsEnum(PetSharePermission)
  permission?: PetSharePermission;
}
