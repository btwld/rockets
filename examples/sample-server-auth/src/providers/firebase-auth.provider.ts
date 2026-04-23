import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type {
  AuthProviderInterface,
  AuthorizedUser,
} from '@bitwild/rockets-core';

/**
 * Firebase Auth Provider — Example implementation of AuthProviderInterface.
 *
 * Demonstrates how to plug a different auth strategy into Rockets
 * without depending on rockets-server-auth or JWT.
 *
 * This is a self-contained example that validates Firebase ID tokens.
 * In production, you would use `firebase-admin` SDK to verify tokens.
 *
 * Usage: in app.module.ts, replace the JWT provider with this one by
 * passing `new FirebaseAuthProvider(\{ projectId: 'my-project' \})` to
 * `RocketsModule.forRoot` as `authProvider`.
 *
 * This provider depends ONLY on `@bitwild/rockets-core` for the
 * `AuthProviderInterface` contract — no JWT, no passport, no concepta auth.
 */
@Injectable()
export class FirebaseAuthProvider implements AuthProviderInterface {
  private readonly logger = new Logger(FirebaseAuthProvider.name);
  private readonly projectId: string;

  constructor(options: FirebaseAuthProviderOptions) {
    this.projectId = options.projectId;
    this.logger.log(
      `Firebase Auth Provider initialized for project: ${this.projectId}`,
    );
  }

  /**
   * Validate a Firebase ID token and return the authorized user.
   *
   * In production, replace the mock logic below with:
   *   const decoded = await admin.auth().verifyIdToken(token);
   */
  async validateToken(token: string): Promise<AuthorizedUser> {
    try {
      // Production implementation would be:
      //
      // import * as admin from 'firebase-admin';
      // const decoded = await admin.auth().verifyIdToken(token);
      // return {
      //   id: decoded.uid,
      //   sub: decoded.sub ?? decoded.uid,
      //   email: decoded.email,
      //   claims: decoded as unknown as Record<string, unknown>,
      // };

      // Example/demo: decode a simple base64 JSON token for testing
      const payload = this.decodeExampleToken(token);

      this.logger.debug(`Firebase token validated for user: ${payload.sub}`);

      return {
        id: payload.uid ?? payload.sub,
        sub: payload.sub,
        email: payload.email,
        userRoles: payload.roles?.map((name: string) => ({
          role: { name },
        })),
        claims: payload,
      };
    } catch (error) {
      this.logger.warn(`Firebase token validation failed: ${String(error)}`);
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }

  /**
   * Demo token decoder — in production, use firebase-admin's verifyIdToken.
   *
   * Accepts a base64url-encoded JSON payload with `sub`, `email`, `uid`
   * fields (e.g. `btoa(JSON.stringify(\{ sub, email, uid \}))`).
   */
  private decodeExampleToken(token: string): FirebaseTokenPayload {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    const payload: unknown = JSON.parse(json);

    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('sub' in payload) ||
      typeof (payload as Record<string, unknown>).sub !== 'string'
    ) {
      throw new Error('Token payload must contain a "sub" field');
    }

    return payload as FirebaseTokenPayload;
  }
}

export interface FirebaseAuthProviderOptions {
  readonly projectId: string;
}

interface FirebaseTokenPayload {
  readonly sub: string;
  readonly uid?: string;
  readonly email?: string;
  readonly roles?: string[];
  readonly [key: string]: unknown;
}
