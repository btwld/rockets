import { Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Rockets Auth User Metadata DTO (Base)
 *
 * Contains only core metadata fields.
 * Implementation-specific fields (firstName, lastName, bio, etc.)
 * should be defined in extending classes.
 *
 * Follows the same pattern as rockets-server's base UserMetadataDto
 */
export class RocketsAuthUserMetadataDto {
  @ApiProperty({ description: 'Metadata ID' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'User ID' })
  @Expose()
  userId!: string;

  @ApiProperty({ description: 'Date created' })
  @Expose()
  dateCreated!: Date;

  @ApiProperty({ description: 'Date updated' })
  @Expose()
  dateUpdated!: Date;

  @ApiPropertyOptional({ description: 'Date deleted' })
  @Expose()
  dateDeleted?: Date | null;

  @ApiProperty({ description: 'Version' })
  @Expose()
  version!: number;
}
