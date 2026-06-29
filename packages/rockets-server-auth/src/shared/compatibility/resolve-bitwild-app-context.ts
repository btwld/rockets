import { PlainLiteralObject } from '@nestjs/common';
import { AppContextHost } from '@concepta/nestjs-core';

/**
 * Upstream `@concepta/nestjs-common` `getAppContext()` stores a different
 * `AppContextHost` class on the request. `@bitwild/rockets-repository`
 * expects the bitwild host at runtime. For auth flows that only need
 * repository I/O, a fresh bitwild host is sufficient.
 */
export function resolveBitwildAppContext(
  explicit?: PlainLiteralObject | AppContextHost | null,
): AppContextHost {
  if (explicit instanceof AppContextHost) {
    return explicit;
  }
  return new AppContextHost();
}
