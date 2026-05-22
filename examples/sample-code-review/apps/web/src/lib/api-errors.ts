/** Mirrors Rockets Firebase auth 401 responses (`FirebaseTokenInvalidException`, etc.). */
export function isAuthFailureStatus(status: number): boolean {
  return status === 401;
}

export function isAuthFailureMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('invalid') ||
    lower.includes('expired') ||
    lower.includes('revoked') ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated') ||
    lower.includes('missing authorization') ||
    lower.includes('bearer')
  );
}

export class ApiError extends Error {
  readonly name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
