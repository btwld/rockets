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
  // Not in the vendored alpha.8 map: nothing in Rockets emitted a 504
  // until `operationResource`'s `deadlineMs` (issue #78), which would
  // otherwise ship the unclassifiable `HTTP_UNKNOWN` on a status core
  // now raises by design.
  [504, 'HTTP_GATEWAY_TIMEOUT'],
]);

export function mapHttpStatus(statusCode: number): string {
  return HTTP_ERROR_CODE.get(statusCode) ?? ERROR_CODE_HTTP_UNKNOWN;
}
