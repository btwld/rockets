import { ReferenceIdInterface } from '@concepta/nestjs-common';
import { Injectable } from '@nestjs/common';
import { RocketsServerAuthOtpServiceInterface } from '../../interfaces/rockets-server-auth-otp-service.interface';

@Injectable()
export class OtpServiceFixture implements RocketsServerAuthOtpServiceInterface {
  async sendOtp(_email: string): Promise<void> {
    // In a fixture, we don't need to actually send an email
    return Promise.resolve();
  }

  async confirmOtp(
    _email: string,
    passcode: string,
  ): Promise<ReferenceIdInterface> {
    // For fixture purposes, we'll validate against our hardcoded passcode
    if (passcode === 'GOOD_PASSCODE') {
      return { id: 'abc' };
    }
    throw new Error('Invalid OTP');
  }
}
