import { ReferenceIdInterface } from '@concepta/nestjs-core';

export interface RocketsAuthOtpServiceInterface {
  sendOtp(email: string): Promise<void>;

  confirmOtp(email: string, passcode: string): Promise<ReferenceIdInterface>;
}
