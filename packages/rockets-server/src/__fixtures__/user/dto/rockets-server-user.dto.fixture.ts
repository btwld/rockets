import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsNumber, IsOptional, Min } from 'class-validator';
import { RocketsServerUserDto } from '../../../dto/user/rockets-server-user.dto';
import { RocketsServerUserInterface } from '../../../interfaces/user/rockets-server-user.interface';
import { Expose } from 'class-transformer';

/**
 * Test-specific DTO with age validation for user create tests
 *
 * This DTO includes age validation for testing purposes across e2e tests
 * without affecting the main project DTOs
 */
export class RocketsServerUserDtoFixture
  extends RocketsServerUserDto
  implements RocketsServerUserInterface
{
  @ApiPropertyOptional()
  @Allow()
  @IsOptional()
  @Expose()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'User age',
    example: 25,
    required: false,
    type: Number,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Age must be a number' })
  @Min(18, { message: 'Age must be at least 18 years old' })
  @Expose()
  age?: number;
}
