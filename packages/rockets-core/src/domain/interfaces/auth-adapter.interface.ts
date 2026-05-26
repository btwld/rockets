import type { AuthorizedUser } from './auth-user.interface';
import type { HttpException } from '@nestjs/common';

/**
 * Slim, transport-agnostic façade of the incoming request handed to
 * every auth adapter. The framework intentionally does NOT expose
 * the native Express/Fastify request as part of the public contract —
 * that would couple core to a specific HTTP server. Use `raw` only
 * when you genuinely need adapter-specific access (mTLS cert,
 * raw body for HMAC signature verification, etc.).
 */
export interface AuthRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
  /** Native request object. Escape hatch — prefer the typed fields above. */
  readonly raw: unknown;
}

/**
 * Outcome of one adapter's attempt to authenticate a request.
 *
 * - `matched: false` — the adapter looked at the request and decided
 *   it is not for it (e.g. no `X-API-Key` header for an API-key
 *   adapter). The guard moves on to the next adapter in the chain.
 * - `matched: true` + `user` — the adapter recognised AND validated
 *   the credential. The guard stops and stamps `req.user`.
 * - `matched: true` + `error` — the adapter recognised the credential
 *   format but rejected it (expired, revoked, bad signature, …).
 *   The guard stops with that exception. We deliberately do NOT try
 *   the next adapter, to avoid surprising passthroughs.
 */
export type AuthAttemptResult =
  | { readonly matched: false }
  | { readonly matched: true; readonly user: AuthorizedUser }
  | { readonly matched: true; readonly error: HttpException };

/**
 * Generic authentication adapter contract.
 *
 * An adapter owns three concerns:
 *  1. WHERE its credential lives (header, query, raw body, …).
 *  2. WHAT the credential looks like (bearer JWT, API key, HMAC
 *     signature, x509 cert subject, …).
 *  3. HOW to validate it and resolve the `AuthorizedUser`.
 *
 * The {@link AuthServerGuard} iterates a chain of adapters and
 * stops on the first conclusive result. Core has NO knowledge of
 * wire formats — every format assumption is implemented inside
 * individual adapters.
 */
export interface AuthAdapterInterface {
  /**
   * Attempt to authenticate the incoming request.
   *
   * Return `{ matched: false }` when the adapter does not recognise
   * the request's credential format (e.g. no `Authorization` header
   * for a Bearer adapter, no `X-API-Key` header for an API-key adapter).
   * The guard will then try the next adapter in the chain.
   *
   * Return `{ matched: true, user }` on success.
   *
   * Return `{ matched: true, error }` when the adapter recognised
   * the credential format but rejected it (expired token, wrong
   * signature, revoked key, …). The guard stops the chain immediately
   * and throws `error` — other adapters are NOT tried, to prevent
   * surprising credential passthroughs.
   */
  authenticate(request: AuthRequest): Promise<AuthAttemptResult>;
}
