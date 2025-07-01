import { OAuthOptionsExtrasInterface } from '@concepta/nestjs-oauth';
import { DynamicModule } from '@nestjs/common';

export interface RocketsServerOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  user?: { imports: DynamicModule['imports'] };
  otp?: { imports: DynamicModule['imports'] };
  federated?: { imports: DynamicModule['imports'] };
  oauth?: { imports?: DynamicModule['imports'] } & OAuthOptionsExtrasInterface;
}
