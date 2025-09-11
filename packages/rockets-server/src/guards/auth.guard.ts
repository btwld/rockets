import { 
  Injectable, 
  CanActivate, 
  ExecutionContext, 
  UnauthorizedException,
  Inject 
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthProviderInterface } from '../interfaces/auth-provider.interface';
import { AuthorizedUser } from '../interfaces/auth-user.interface';
import { RocketsServerAuthProvider } from '../rockets-server.constants';

// Decorator to mark routes as public (skip authentication)
export const Public = Reflector.createDecorator<boolean>();

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(RocketsServerAuthProvider)
    private readonly authProvider: AuthProviderInterface,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(Public, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      // Verify the token using the auth provider directly
      const user: AuthorizedUser = await this.authProvider.validateToken(token);
      
      // Attach user to request for use in controllers (this makes @AuthUser() work)
      request.user = user

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  private extractTokenFromHeader(request: { headers?: { authorization?: string } }): string | undefined {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return undefined;
    }
    
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
