import { AuthenticationJwtResponseDto } from '@concepta/nestjs-authentication';

/**
 * Rockets Server JWT Response DTO
 *
 * Extends the base authentication JWT response DTO from the authentication module
 */
export class RocketsServerAuthJwtResponseDto extends AuthenticationJwtResponseDto {
  /**
   * When extending the base DTO, you can add additional properties
   * specific to your application here
   */
}
