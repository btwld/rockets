import type { AuthRequest } from '../../domain/interfaces/auth-adapter.interface';

/**
 * Extract the Bearer token from the `Authorization` header of an
 * {@link AuthRequest}, following RFC 7235 (case-insensitive scheme).
 *
 * Returns `null` when:
 *  - no `Authorization` header is present
 *  - the scheme is not `Bearer` (case-insensitive)
 *  - the token after `Bearer ` is empty or whitespace-only
 *
 * Use this helper inside `authenticate()` implementations that
 * handle Bearer credentials:
 *
 * ```ts
 * async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
 *   const token = extractBearerToken(request);
 *   if (token === null) return { matched: false };
 *   // … validate the token …
 * }
 * ```
 */
export function extractBearerToken(request: AuthRequest): string | null {
  const raw = request.headers['authorization'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;

  const spaceIndex = header.indexOf(' ');
  if (spaceIndex === -1) return null;

  const scheme = header.slice(0, spaceIndex);
  if (scheme.toLowerCase() !== 'bearer') return null;

  const token = header.slice(spaceIndex + 1).trim();
  return token.length > 0 ? token : null;
}
