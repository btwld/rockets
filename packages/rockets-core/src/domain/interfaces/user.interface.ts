/**
 * Base user entity interface.
 * All user entities must implement this.
 */
export interface BaseUserEntityInterface {
  id: string;
  sub: string;
  email?: string;
  roles?: string[];
  claims?: Record<string, unknown>;
}

export interface UserEntityInterface extends BaseUserEntityInterface {
  userMetadata?: Record<string, unknown>;
}

export interface UserCreatableInterface {
  sub: string;
  email?: string;
  roles?: string[];
  claims?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UserUpdatableInterface {
  userMetadata?: Record<string, unknown>;
}

export interface UserModelUpdatableInterface extends UserUpdatableInterface {
  id: string;
}

export class BaseUserDto {
  id?: string;
  sub?: string;
  email?: string;
  roles?: string[];
  claims?: Record<string, unknown>;
}

export class BaseUserCreateDto extends BaseUserDto {
  sub!: string;
}

export class BaseUserUpdateDto extends BaseUserDto {
  userMetadata?: Record<string, unknown>;
}
