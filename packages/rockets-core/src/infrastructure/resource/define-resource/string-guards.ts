export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isNonEmptyStringArray(
  value: unknown,
): value is readonly string[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)
  );
}

export function isNonEmptyStringOrStringArray(
  value: unknown,
): value is string | readonly string[] {
  return isNonEmptyString(value) || isNonEmptyStringArray(value);
}
