import { AuthJwtSettingsInterface } from '@concepta/nestjs-auth-jwt/dist/interfaces/auth-jwt-settings.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthJwtServiceFixture {
  public discriminator: string = 'default';

  constructor(private readonly options?: AuthJwtSettingsInterface) {}

  getOptions(): AuthJwtSettingsInterface | undefined {
    return this.options;
  }
}
