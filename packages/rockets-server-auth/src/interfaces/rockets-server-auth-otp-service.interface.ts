import { ReferenceIdInterface } from '@concepta/nestjs-common';

export interface RocketsServerAuthOtpServiceInterface {
  sendOtp(email: string): Promise<void>;

  confirmOtp(email: string, passcode: string): Promise<ReferenceIdInterface>;
}
