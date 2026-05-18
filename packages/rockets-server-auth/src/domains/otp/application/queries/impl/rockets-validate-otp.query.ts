import { ReferenceAssignment } from '@concepta/nestjs-common';
import { OtpInterface } from '@concepta/nestjs-otp';

export class RocketsValidateOtpQuery {
  constructor(
    public readonly assignment: ReferenceAssignment,
    public readonly otp: Pick<OtpInterface, 'category' | 'passcode'>,
    public readonly deleteIfValid: boolean,
  ) {}
}
