import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { isAuthPublic } from '@concepta/nestjs-authentication';
import type {
  AuthAdapterInterface,
  AuthRequest,
} from '../../domain/interfaces/auth-adapter.interface';
import type { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';
import { AUTH_ADAPTERS_TOKEN } from '../../rockets-core.constants';

/**
 * Shape of the native HTTP request as seen by the guard.
 * Kept minimal and platform-agnostic — the guard never depends on
 * Express/Fastify types.
 */
interface NativeRequest {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  user?: AuthorizedUser;
}

@Injectable()
export class AuthServerGuard implements CanActivate {
  private readonly logger = new Logger(AuthServerGuard.name);

  constructor(
    @Inject(AUTH_ADAPTERS_TOKEN)
    private readonly adapters: ReadonlyArray<AuthAdapterInterface>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Upstream owns both the metadata key and the `true | 'classLevel'`
    // sentinel `AuthPublic` writes; reading it through their helper is
    // what keeps this guard from drifting when either one changes.
    if (isAuthPublic(context.getHandler(), context.getClass())) {
      return true;
    }

    const native = context.switchToHttp().getRequest<NativeRequest>();
    const request: AuthRequest = {
      headers: native.headers ?? {},
      query: native.query ?? {},
      raw: native,
    };

    for (const adapter of this.adapters) {
      const adapterName = adapter.constructor.name;
      let result;

      try {
        result = await adapter.authenticate(request);
      } catch (err) {
        this.logger.error(
          `Adapter ${adapterName} threw an unexpected error: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err instanceof Error ? err.stack : undefined,
        );
        throw new UnauthorizedException('Authentication failed');
      }

      if (!result.matched) {
        this.logger.debug(`Adapter ${adapterName} did not match the request`);
        continue;
      }

      if ('error' in result) {
        // Adapter claimed the request but rejected the credential.
        // Stop the chain — trying other adapters would risk a
        // surprising passthrough on a credential the caller clearly
        // intended for this adapter.
        this.logger.debug(
          `Adapter ${adapterName} rejected the credential: ${result.error.message}`,
        );
        throw result.error;
      }

      this.logger.debug(`Adapter ${adapterName} authenticated the request`);
      native.user = result.user;
      return true;
    }

    throw new UnauthorizedException('Authentication failed');
  }
}
