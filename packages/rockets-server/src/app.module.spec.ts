

import { Test, TestingModule } from '@nestjs/testing';

import { AuthJwtModule, AuthJwtUserModelServiceInterface } from '@concepta/nestjs-auth-jwt';
import {
  AuthenticationModule,
  VerifyTokenServiceInterface
} from '@concepta/nestjs-authentication';
import { JwtModule } from '@concepta/nestjs-jwt';
import { Injectable } from '@nestjs/common';

import {
  ReferenceIdInterface,
  ReferenceSubject,
} from '@concepta/nestjs-common';


@Injectable()
export class UserModelServiceFixture
  implements AuthJwtUserModelServiceInterface
{
  async bySubject(subject: ReferenceSubject): Promise<ReferenceIdInterface> {
    throw new Error(`Method not implemented, cant get ${subject}.`);
  }
}

export class VerifyTokenServiceFixture implements VerifyTokenServiceInterface {
  public discriminator = 'default';

  async accessToken(
    _token: string,
    _options?: any,
  ): Promise<object> {
    throw new Error('Method not implemented.');
  }

  async refreshToken(
    _token: string,
    _options?: any,
  ): Promise<object> {
    throw new Error('Method not implemented.');
  }
}
describe(AuthJwtModule, () => {
  
  let testModule: TestingModule;

  describe(AuthJwtModule.forRoot, () => {
    beforeEach(async () => {
      testModule = await Test.createTestingModule(
        {
          imports: [
            AuthenticationModule.forRoot({}),
            JwtModule.forRoot({}),
            AuthJwtModule.forRoot({
              verifyTokenService: new VerifyTokenServiceFixture(),
              userModelService: new UserModelServiceFixture(),
            }),
          ],
        }
      ).compile();
    });

    it.only('module should be loaded', async () => {
     
    });
  });
 
});
 