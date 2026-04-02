import { OtpCreateParamsInterface } from '@concepta/nestjs-common';

export class RocketsCreateOtpCommand {
  constructor(public readonly params: OtpCreateParamsInterface) {}
}
