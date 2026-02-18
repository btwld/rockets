import { AuthJwtSettingsInterface } from '@concepta/nestjs-auth-jwt';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthJwtServiceFixture {
  public discriminator: string = 'default';

  constructor(private readonly options?: AuthJwtSettingsInterface) {}

  getOptions(): AuthJwtSettingsInterface | undefined {
    return this.options;
  }
}
