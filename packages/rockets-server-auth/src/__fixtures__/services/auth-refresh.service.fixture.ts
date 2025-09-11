import { AuthRefreshSettingsInterface } from '@concepta/nestjs-auth-refresh/dist/interfaces/auth-refresh-settings.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthRefreshServiceFixture {
  public discriminator: string = 'default';

  constructor(private readonly options?: AuthRefreshSettingsInterface) {}

  getOptions(): AuthRefreshSettingsInterface | undefined {
    return this.options;
  }
}
