/**
 * Drop keys whose value is `undefined`. Used so a PATCH that only sets
 * some fields does not wipe the others back to `undefined` on update.
 */
export function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
