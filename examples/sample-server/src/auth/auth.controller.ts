import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { AuthPublic } from '@bitwild/rockets-core';
import { SampleAuthAdapter } from './auth.adapter';
import { UserRole } from './user.entity';

class SignupDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  name?: string;

  // NOTE: sample-only. A real app would never let a signup request claim
  // an admin role — admin elevation would be gated by an owner-level
  // workflow or a bootstrapping migration. We accept it here so the e2e
  // suite can stand up an admin without a dedicated seeder.
  @ApiPropertyOptional({ enum: UserRole, example: UserRole.USER })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}

class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

class SignupResponseDto {
  @ApiProperty({ description: 'Generated UUID for the new account' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  name?: string;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role!: UserRole;

  @ApiProperty({ description: 'Signed JWT — pass as Bearer token' })
  accessToken!: string;
}

class LoginResponseDto {
  @ApiProperty({ description: 'Signed JWT — pass as Bearer token' })
  accessToken!: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authAdapter: SampleAuthAdapter) {}

  @Post('signup')
  @AuthPublic()
  @ApiOperation({ summary: 'Create a new account' })
  @ApiResponse({ status: 201, type: SignupResponseDto, description: 'Account created, returns JWT' })
  @ApiResponse({ status: 409, description: 'Email is already registered' })
  async signup(@Body() dto: SignupDto): Promise<SignupResponseDto> {
    const { user, accessToken } = await this.authAdapter.signup(
      dto.email,
      dto.password,
      dto.name,
      dto.role,
    );
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? UserRole.USER,
      accessToken,
    };
  }

  @Post('login')
  @AuthPublic()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: LoginResponseDto, description: 'Returns JWT' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authAdapter.login(dto.email, dto.password);
  }
}
