import { ReferenceAssignment } from '@concepta/nestjs-core';
import { OtpCreatableInterface } from '@concepta/nestjs-otp';

/**
 * Parameters for creating an OTP through the Rockets Auth port.
 *
 * v8 collapse: the upstream `OtpCreateParamsInterface` from
 * `@concepta/nestjs-common@v7` is gone. v8's `nestjs-otp` exposes the same
 * shape via `OtpCreatableInterface`; the `assignment` is carried alongside
 * because Rockets dispatches commands across multiple OTP namespaces.
 */
export interface RocketsCreateOtpParams {
  assignment: ReferenceAssignment;
  otp: Pick<
    OtpCreatableInterface,
    'category' | 'type' | 'assigneeId' | 'expiresIn'
  > &
    Partial<Pick<OtpCreatableInterface, 'rateSeconds' | 'rateThreshold'>>;
}

export class RocketsCreateOtpCommand {
  constructor(public readonly params: RocketsCreateOtpParams) {}
}
