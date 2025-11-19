import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Rockets Auth Invitation Revoke DTO
 *
 * DTO for revoking invitations by email and category
 */
export class RocketsAuthInvitationRevokeDto {
  @ApiProperty({
    description: 'Email address to revoke invitations for',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'Category of invitations to revoke',
    example: 'user',
  })
  @IsString()
  @IsNotEmpty()
  category!: string;
}

