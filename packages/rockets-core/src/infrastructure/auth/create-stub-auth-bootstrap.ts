import type { Type } from '@nestjs/common';
import type { AuthAdapterInterface } from '../../domain/interfaces/auth-adapter.interface';
import type { AuthBootstrap } from '../../domain/interfaces/auth-bootstrap.interface';

/** Minimal AuthBootstrap for core e2e tests — exports adapter from a host module. */
export function createStubAuthBootstrap<Adapter extends AuthAdapterInterface>(
  adapter: Type<Adapter>,
): AuthBootstrap<Adapter> {
  return {
    adapter,
    forRoot: () => ({
      module: class StubAuthHostModule {},
      providers: [adapter],
      exports: [adapter],
    }),
  };
}
