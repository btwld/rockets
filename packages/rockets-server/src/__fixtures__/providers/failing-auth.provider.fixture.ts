import { Injectable } from '@nestjs/common';
import { AuthProviderInterface } from '../../interfaces/auth-provider.interface';
import { AuthorizedUser } from '../../interfaces/auth-user.interface';

@Injectable()
export class FailingAuthProviderFixture implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    // This provider always fails authentication for testing error scenarios
    throw new Error('Invalid token');
  }
}
