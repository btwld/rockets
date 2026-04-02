import { ReferenceAssignment, OtpInterface } from '@concepta/nestjs-common';

export class RocketsValidateOtpQuery {
  constructor(
    public readonly assignment: ReferenceAssignment,
    public readonly otp: Pick<OtpInterface, 'category' | 'passcode'>,
    public readonly deleteIfValid: boolean,
  ) {}
}
