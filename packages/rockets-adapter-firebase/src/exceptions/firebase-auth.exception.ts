import { UnauthorizedException } from '@nestjs/common';

/**
 * Base for every auth failure surfaced by this adapter. Always maps to
 * HTTP 401 — the consumer should treat these as "not authenticated",
 * never as "configuration error" (which throws at module bootstrap
 * instead).
 *
 * The original cause is preserved on the standard `Error.cause` slot
 * (Nest's `HttpException` options.cause) so logs / Sentry capture it
 * without surfacing the raw firebase-admin error to the client.
 */
export class FirebaseAuthException extends UnauthorizedException {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}
