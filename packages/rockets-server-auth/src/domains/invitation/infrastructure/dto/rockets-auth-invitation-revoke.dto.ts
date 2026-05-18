import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Rockets Auth Invitation Revoke DTO
 *
 * DTO for revoking invitations by email and category.
 *
 * **Note on category validation:**
 * The `category` field accepts any non-empty string by design. This SDK cannot
 * predetermine what categories your application will use. If you need strict
 * category validation, extend this DTO in your application and add `@IsIn()`
 * with your specific category values.
 *
 * @example
 * ```typescript
 * // In your application, extend with strict validation:
 * import { IsIn } from 'class-validator';
 *
 * export class MyInvitationRevokeDto extends RocketsAuthInvitationRevokeDto {
 *   @IsIn(['user', 'admin', 'organization'])
 *   @IsNotEmpty()
 *   category!: 'user' | 'admin' | 'organization';
 * }
 * ```
 */
export class RocketsAuthInvitationRevokeDto {
  @ApiProperty({
    description: 'Email address to revoke invitations for',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  /**
   * Category of invitations to revoke.
   *
   * This accepts any string value. The SDK does not enforce specific categories
   * as they are implementation-specific. Common examples include 'user', 'admin',
   * 'organization', etc.
   *
   * For strict validation in your application, extend this DTO and add
   * `@IsIn(['your', 'categories'])` decorator.
   */
  @ApiProperty({
    description:
      'Category of invitations to revoke (implementation-specific, e.g., "user", "admin")',
    example: 'user',
  })
  @IsString()
  @IsNotEmpty()
  category!: string;
}
