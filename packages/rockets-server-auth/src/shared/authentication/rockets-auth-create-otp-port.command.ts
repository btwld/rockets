import { PlainLiteralObject } from '@nestjs/common';
import { Command } from '@nestjs/cqrs';
import type {
  AuthenticationOtpCreatableInterface,
  AuthenticationOtpInterface,
  CreateOtpCommandInterface,
} from '@concepta/nestjs-authentication';

// TODO(upstream: concepta/nestjs-otp + nestjs-authentication) — upstream
// `CreateOtpCommand` constructor stores the payload on `dto`
// (`create-otp.command.ts:21`), but `CreateOtpCommandInterface` (the auth
// `OtpPort.createCommand` contract) requires the field name `otp`. The
// `AuthenticationOtpCreatableInterface` shape also differs slightly from
// `OtpCreatableInterface`. This bridge command + its handler exist solely
// to translate. Tracked in: .context/upstream-gaps.md (G10). Restore when:
// upstream renames `CreateOtpCommand.dto` → `otp` (or aligns the interfaces
// so the upstream class satisfies `CreateOtpCommandInterface` directly).
// Then this command + `RocketsAuthCreateOtpPortHandler` can be deleted and
// `buildRocketsAuthenticationPorts` can wire `CreateOtpCommand` directly.
/**
 * CQRS command implementing {@link CreateOtpCommandInterface} so {@link OtpPort#create}
 * (`new createCommand(ctx, namespace, otp, options)`) matches the authentication contract.
 * The upstream {@link CreateOtpCommand} stores the payload on `dto`; this type exposes it as `otp`.
 */
export class RocketsAuthCreateOtpPortCommand
  extends Command<AuthenticationOtpInterface>
  implements CreateOtpCommandInterface
{
  readonly ctx: PlainLiteralObject;

  readonly namespace: string;

  readonly otp: AuthenticationOtpCreatableInterface;

  readonly duplicateStrategy?: 'ALLOW' | 'DEACTIVATE';

  readonly rateSeconds?: number;

  readonly rateThreshold?: number;

  constructor(
    ctx: PlainLiteralObject,
    namespace: string,
    otp: AuthenticationOtpCreatableInterface,
    options?: {
      duplicateStrategy?: 'ALLOW' | 'DEACTIVATE';
      rateSeconds?: number;
      rateThreshold?: number;
    },
  ) {
    super();
    this.ctx = ctx;
    this.namespace = namespace;
    this.otp = otp;
    this.duplicateStrategy = options?.duplicateStrategy;
    this.rateSeconds = options?.rateSeconds;
    this.rateThreshold = options?.rateThreshold;
  }
}
