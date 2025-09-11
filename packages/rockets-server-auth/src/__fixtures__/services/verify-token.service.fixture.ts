import { VerifyTokenServiceInterface } from '@concepta/nestjs-authentication';
import { JwtVerifyOptions } from '@nestjs/jwt';

export class VerifyTokenServiceFixture implements VerifyTokenServiceInterface {
  public discriminator = 'default';

  async accessToken(
    _token: string,
    _options?: JwtVerifyOptions | undefined,
  ): Promise<object> {
    return Promise.resolve({});
  }

  async refreshToken(
    _token: string,
    _options?: JwtVerifyOptions | undefined,
  ): Promise<object> {
    return Promise.resolve({});
  }
}
