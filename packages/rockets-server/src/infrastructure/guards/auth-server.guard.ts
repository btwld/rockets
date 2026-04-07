import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATION_MODULE_DISABLE_GUARDS_TOKEN } from '@concepta/nestjs-authentication';
import { AuthProviderInterface } from '../../domain/interfaces/auth-provider.interface';
import { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';
import { RocketsAuthProvider } from '../../rockets.constants';

@Injectable()
export class AuthServerGuard implements CanActivate {
  constructor(
    @Inject(RocketsAuthProvider)
    private readonly authProvider: AuthProviderInterface,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isDisabled = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATION_MODULE_DISABLE_GUARDS_TOKEN,
      [context.getHandler(), context.getClass()],
    );

    if (isDisabled === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      const user: AuthorizedUser = await this.authProvider.validateToken(token);
      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  private extractTokenFromHeader(request: {
    headers?: { authorization?: string };
  }): string | undefined {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
