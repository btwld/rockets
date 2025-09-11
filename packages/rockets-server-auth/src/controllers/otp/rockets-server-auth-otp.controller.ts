import { AuthLocalIssueTokenService } from '@concepta/nestjs-auth-local';
import {
  AuthPublic,
  IssueTokenServiceInterface,
} from '@concepta/nestjs-authentication';
import { Body, Controller, Inject, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RocketsServerAuthJwtResponseDto } from '../../dto/auth/rockets-server-auth-jwt-response.dto';
import { RocketsServerAuthOtpConfirmDto } from '../../dto/rockets-server-auth-otp-confirm.dto';
import { RocketsServerAuthOtpSendDto } from '../../dto/rockets-server-auth-otp-send.dto';
import { RocketsServerAuthAuthenticationResponseInterface } from '../../interfaces/common/rockets-server-auth-authentication-response.interface';
import { RocketsServerAuthOtpService } from '../../services/rockets-server-auth-otp.service';

/**
 * Controller for One-Time Password (OTP) operations
 * Handles sending and confirming OTPs for authentication
 */
@Controller('otp')
@AuthPublic()
@ApiTags('otp')
export class RocketsServerAuthOtpController {
  constructor(
    @Inject(AuthLocalIssueTokenService)
    private issueTokenService: IssueTokenServiceInterface,
    private readonly otpService: RocketsServerAuthOtpService,
  ) {}

  @ApiOperation({
    summary: 'Send OTP to the provided email',
    description:
      'Generates a one-time passcode and sends it to the specified email address',
  })
  @ApiBody({
    type: RocketsServerAuthOtpSendDto,
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
  @Post('')
  async sendOtp(@Body() dto: RocketsServerAuthOtpSendDto): Promise<void> {
    return this.otpService.sendOtp(dto.email);
  }

  @ApiOperation({
    summary: 'Confirm OTP for a given email and passcode',
    description:
      'Validates the OTP passcode for the specified email and returns authentication tokens on success',
  })
  @ApiBody({
    type: RocketsServerAuthOtpConfirmDto,
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
    type: RocketsServerAuthJwtResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid email format or missing required fields',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid OTP or expired passcode',
  })
  @Patch('')
  async confirmOtp(
    @Body() dto: RocketsServerAuthOtpConfirmDto,
  ): Promise<RocketsServerAuthAuthenticationResponseInterface> {
    const user = await this.otpService.confirmOtp(dto.email, dto.passcode);
    return this.issueTokenService.responsePayload(user.id);
  }
}
