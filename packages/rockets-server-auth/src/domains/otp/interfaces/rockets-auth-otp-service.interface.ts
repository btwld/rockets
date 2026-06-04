import { ReferenceIdInterface } from '@bitwild/rockets-app';

export interface RocketsAuthOtpServiceInterface {
  sendOtp(email: string): Promise<void>;

  confirmOtp(email: string, passcode: string): Promise<ReferenceIdInterface>;
}
