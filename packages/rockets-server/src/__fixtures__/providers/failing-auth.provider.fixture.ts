import { Injectable } from '@nestjs/common';
import { AuthProviderInterface } from '../../domain/interfaces/auth-provider.interface';
import { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';

@Injectable()
export class FailingAuthProviderFixture implements AuthProviderInterface {
  async validateToken(_token: string): Promise<AuthorizedUser> {
    // This provider always fails authentication for testing error scenarios
    throw new Error('Invalid token');
  }
}
