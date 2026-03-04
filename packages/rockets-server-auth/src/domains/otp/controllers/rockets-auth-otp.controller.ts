import { AuthLocalIssueTokenService } from '@concepta/nestjs-auth-local';
import {
  AuthPublic,
  IssueTokenServiceInterface,
} from '@concepta/nestjs-authentication';
import { Body, Controller, Inject, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RocketsAuthJwtResponseDto } from '../../auth/dto/rockets-auth-jwt-response.dto';
import { RocketsAuthOtpConfirmDto } from '../dto/rockets-auth-otp-confirm.dto';
import { RocketsAuthOtpSendDto } from '../dto/rockets-auth-otp-send.dto';
import { RocketsAuthAuthenticationResponseInterface } from '../../../interfaces/common/rockets-auth-authentication-response.interface';
import { RocketsAuthOtpService } from '../services/rockets-auth-otp.service';

/**
 * Controller for One-Time Password (OTP) operations
 * Handles sending and confirming OTPs for authentication
 */
@Controller('otp')
@AuthPublic()
@ApiTags('Authentication')
export class RocketsAuthOtpController {
  constructor(
    @Inject(AuthLocalIssueTokenService)
    private issueTokenService: IssueTokenServiceInterface,
    private readonly otpService: RocketsAuthOtpService,
  ) {}

  @ApiOperation({
    summary: 'Send OTP to the provided email',
    description:
      'Generates a one-time passcode and sends it to the specified email address',
  })
  @ApiBody({
    type: RocketsAuthOtpSendDto,
    description: 'Email to receive the OTP',
    examples: {
      standard: {
        value: {
          email: 'user@example.com',
        },
        summary: 'Standard OTP request',
      },
    },
  })
  @ApiOkResponse({
    description: 'OTP sent successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid email format',
  })
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 OTP requests per minute
  @Post()
  async sendOtp(@Body() dto: RocketsAuthOtpSendDto): Promise<void> {
    return this.otpService.sendOtp(dto.email);
  }

  @ApiOperation({
    summary: 'Confirm OTP for a given email and passcode',
    description:
      'Validates the OTP passcode for the specified email and returns authentication tokens on success',
  })
  @ApiBody({
    type: RocketsAuthOtpConfirmDto,
    description: 'Email and passcode for OTP verification',
    examples: {
      standard: {
        value: {
          email: 'user@example.com',
          passcode: '123456',
        },
        summary: 'Standard OTP confirmation',
      },
    },
  })
  @ApiOkResponse({
    description: 'OTP confirmed successfully, authentication tokens provided',
    type: RocketsAuthJwtResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid email format or missing required fields',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid OTP or expired passcode',
  })
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 confirmation attempts per minute
  @Patch()
  async confirmOtp(
    @Body() dto: RocketsAuthOtpConfirmDto,
  ): Promise<RocketsAuthAuthenticationResponseInterface> {
    const user = await this.otpService.confirmOtp(dto.email, dto.passcode);
    return this.issueTokenService.responsePayload(user.id);
  }
}
