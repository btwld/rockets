import { ReferenceAssignment, OtpInterface } from '@concepta/nestjs-common';

export class RocketsClearOtpsCommand {
  constructor(
    public readonly assignment: ReferenceAssignment,
    public readonly otp: Pick<OtpInterface, 'assigneeId' | 'category'>,
  ) {}
}
