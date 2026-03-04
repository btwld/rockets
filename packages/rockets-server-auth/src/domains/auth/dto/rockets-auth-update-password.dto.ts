import { AuthRecoveryUpdatePasswordDto } from '@concepta/nestjs-auth-recovery';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Rockets Server Update Password DTO
 *
 * Extends the base recovery update password DTO from the auth-recovery module
 */
export class RocketsAuthUpdatePasswordDto extends AuthRecoveryUpdatePasswordDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    title: 'account reset passcode',
    type: 'string',
    description: 'Passcode used to reset account password',
  })
  passcode = '';
}
