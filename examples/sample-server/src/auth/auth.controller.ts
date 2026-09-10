import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthPublic, rocketsSchemaValidation } from '@concepta/rockets-core';
import { SampleAuthAdapter } from './auth.adapter';
import {
  loginResponseSchema,
  loginSchema,
  signupResponseSchema,
  signupSchema,
  type LoginBody,
  type LoginResponse,
  type SignupBody,
  type SignupResponse,
} from './auth.schema';

/**
 * Hand-written controller on Nest 12's native Standard Schema path: the
 * class-level pipe validates every `@Body({ schema })` with the Rockets
 * exception factory (400 + structured `details`), and the serializer
 * interceptor runs each response through its named schema — the same
 * engine generated CRUD resources use, so undeclared keys never leak.
 */
@ApiTags('Auth')
@Controller('auth')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class AuthController {
  constructor(private readonly authAdapter: SampleAuthAdapter) {}

  @Post('signup')
  @AuthPublic()
  @ApiOperation({ summary: 'Create a new account' })
  @ApiResponse({
    status: 201,
    standardSchema: signupResponseSchema,
    description: 'Account created, returns JWT',
  })
  @ApiResponse({ status: 409, description: 'Email is already registered' })
  @SerializeOptions({ schema: signupResponseSchema })
  async signup(
    @Body({ schema: signupSchema }) dto: SignupBody,
  ): Promise<SignupResponse> {
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
      role: user.role,
      accessToken,
    };
  }

  @Post('login')
  @AuthPublic()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    standardSchema: loginResponseSchema,
    description: 'Returns JWT',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @SerializeOptions({ schema: loginResponseSchema })
  async login(
    @Body({ schema: loginSchema }) dto: LoginBody,
  ): Promise<LoginResponse> {
    return this.authAdapter.login(dto.email, dto.password);
  }
}
