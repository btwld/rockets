import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RocketsServerAuthOtpConfirmDto {
  @ApiProperty({
    description: 'Email associated with the OTP',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'OTP passcode to verify',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  passcode: string;
}
