import { Injectable } from '@nestjs/common';
import { AuthAdapterInterface } from '../../domain/interfaces/auth-adapter.interface';
import { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';

@Injectable()
export class FailingAuthAdapterFixture implements AuthAdapterInterface {
  async validateToken(_token: string): Promise<AuthorizedUser> {
    // This provider always fails authentication for testing error scenarios
    throw new Error('Invalid token');
  }
}
