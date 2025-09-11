import { AuthLocalLoginDto } from '@concepta/nestjs-auth-local';

/**
 * Rockets Server Login DTO
 *
 * Extends the base local login DTO from the auth-local module
 */
export class RocketsServerAuthLoginDto extends AuthLocalLoginDto {
  /**
   * When extending the base DTO, you can add additional properties
   * specific to your application here
   */
}
