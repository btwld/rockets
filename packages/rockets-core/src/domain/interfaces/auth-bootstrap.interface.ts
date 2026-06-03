import type { DynamicModule, Type } from '@nestjs/common';
import type { AuthAdapterInterface } from './auth-adapter.interface';

/**
 * Light / external auth wiring. When `forRoot` is set, core imports the
 * returned module after swagger (repos must exist via `forFeature` first).
 */
export interface AuthBootstrap<
  Adapter extends AuthAdapterInterface = AuthAdapterInterface,
> {
  readonly adapter: Type<Adapter>;
  readonly forRoot?: () => DynamicModule;
}
