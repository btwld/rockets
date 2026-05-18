import { PlainLiteralObject } from '@nestjs/common';

export class ChangeMyPasswordCommand {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly userId: string,
    public readonly currentPassword: string,
    public readonly newPassword: string,
  ) {}
}
