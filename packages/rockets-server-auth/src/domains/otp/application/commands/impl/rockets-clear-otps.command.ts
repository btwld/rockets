import { ReferenceAssignment } from '@bitwild/rockets-app';
import { OtpInterface } from '@concepta/nestjs-otp';

export class RocketsClearOtpsCommand {
  constructor(
    public readonly assignment: ReferenceAssignment,
    public readonly otp: Pick<OtpInterface, 'assigneeId' | 'category'>,
  ) {}
}
