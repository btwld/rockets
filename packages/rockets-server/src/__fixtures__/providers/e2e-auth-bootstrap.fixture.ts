import type { Type } from '@nestjs/common';
import {
  createStubAuthBootstrap,
  type AuthAdapterInterface,
  type AuthBootstrap,
} from '@bitwild/rockets-core';

/** Wrap a test adapter class as an {@link AuthBootstrap} for server e2e. */
export function e2eAuthBootstrap<Adapter extends AuthAdapterInterface>(
  adapter: Type<Adapter>,
): AuthBootstrap<Adapter> {
  return createStubAuthBootstrap(adapter);
}
