import type { RocketsErrorDetail } from '../../domain/interfaces/error-detail.interface';

/**
 * Carrier for structured validation details on an exception INSTANCE.
 *
 * A symbol property, never a key inside `getResponse()`: Nest's default
 * exception filter replies with the response object verbatim, so a
 * `details` key in the payload would change the 400 body of every app
 * that never registered `RocketsCoreExceptionsFilter` — an opt-out
 * nobody asked for, discovered in review. A symbol on the instance is
 * invisible to that filter and to `JSON.stringify`, so the no-filter
 * body stays byte-identical and only the Rockets filter, which looks
 * for it deliberately, ever sees the details.
 *
 * `Symbol.for` so two package copies still recognise each other's
 * carriers — same reasoning as the generated-DTO brand.
 */
export const ROCKETS_ERROR_DETAILS = Symbol.for(
  '@concepta/rockets-core/error-details',
);

export function attachErrorDetails<T extends object>(
  exception: T,
  details: readonly RocketsErrorDetail[],
): T {
  if (details.length > 0 && Object.isExtensible(exception)) {
    // `configurable`/`writable` so a re-attach (a wrapper enriching the
    // findings) replaces instead of throwing — a TypeError INSIDE the
    // error path would turn a 400 into an unhandled crash. A frozen
    // exception is skipped for the same reason: losing details beats
    // losing the response. `enumerable: false` alone is what keeps the
    // no-filter body and JSON.stringify clean.
    Object.defineProperty(exception, ROCKETS_ERROR_DETAILS, {
      value: details,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return exception;
}

export function readErrorDetails(
  exception: unknown,
): readonly RocketsErrorDetail[] | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const value: unknown = Reflect.get(exception, ROCKETS_ERROR_DETAILS);
  return isDetailList(value) && value.length > 0 ? value : undefined;
}

/** Every entry a well-formed detail — segment types included. */
function isDetailList(value: unknown): value is readonly RocketsErrorDetail[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        Array.isArray(Reflect.get(entry, 'path')) &&
        (Reflect.get(entry, 'path') as unknown[]).every(
          (segment) =>
            typeof segment === 'string' || typeof segment === 'number',
        ) &&
        typeof Reflect.get(entry, 'message') === 'string',
    )
  );
}
