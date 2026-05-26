import { Exclude, Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PetSharePermission } from './pet-share.entity';

@Exclude()
export class PetShareResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) petId!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;

  @Expose()
  @ApiProperty({ enum: PetSharePermission })
  permission!: PetSharePermission;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateCreated!: Date;
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
