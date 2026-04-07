import { DynamicModule, Module } from '@nestjs/common';
import { MeController } from './gateways/http/me.controller';

@Module({})
export class UserModule {
  static register(): DynamicModule {
    return {
      module: UserModule,
      controllers: [MeController],
    };
  }
}
