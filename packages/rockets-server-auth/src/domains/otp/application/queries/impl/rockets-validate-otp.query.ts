import { ReferenceAssignment } from '@bitwild/rockets-app';
import { OtpInterface } from '@concepta/nestjs-otp';

export class RocketsValidateOtpQuery {
  constructor(
    public readonly assignment: ReferenceAssignment,
    public readonly otp: Pick<OtpInterface, 'category' | 'passcode'>,
    public readonly deleteIfValid: boolean,
  ) {}
}
