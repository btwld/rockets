import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { AuthPublic } from '@bitwild/rockets-core';
import { SampleAuthAdapter } from './auth.adapter';
import { UserRole } from './user.entity';
import {
  LoginDto,
  type LoginBody,
  SignupDto,
  type SignupBody,
} from './auth.dto';

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
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: 201,
    type: SignupResponseDto,
    description: 'Account created, returns JWT',
  })
  @ApiResponse({ status: 409, description: 'Email is already registered' })
  async signup(
    @Body({ schema: SignupDto.schema }) dto: SignupBody,
  ): Promise<SignupResponseDto> {
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
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    type: LoginResponseDto,
    description: 'Returns JWT',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body({ schema: LoginDto.schema }) dto: LoginBody,
  ): Promise<LoginResponseDto> {
    return this.authAdapter.login(dto.email, dto.password);
  }
}
