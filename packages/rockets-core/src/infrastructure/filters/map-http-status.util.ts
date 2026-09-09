/**
 * HTTP status → Rockets error code, for the envelope's `errorCode`.
 * Vendored from `@concepta/nestjs-core@8.0.0-alpha.8` (removed in
 * alpha.9); the codes are part of the documented error envelope, so the
 * mapping stays exactly as it was.
 */
export const ERROR_CODE_HTTP_UNKNOWN = 'HTTP_UNKNOWN';

const HTTP_ERROR_CODE: ReadonlyMap<number, string> = new Map([
  [400, 'HTTP_BAD_REQUEST'],
  [401, 'HTTP_UNAUTHORIZED'],
  [404, 'HTTP_NOT_FOUND'],
  [500, 'HTTP_INTERNAL_SERVER_ERROR'],
]);

export function mapHttpStatus(statusCode: number): string {
  return HTTP_ERROR_CODE.get(statusCode) ?? ERROR_CODE_HTTP_UNKNOWN;
}
