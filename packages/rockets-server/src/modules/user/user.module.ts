import { DynamicModule, Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { UserMetadataModule } from '../user-metadata/user-metadata.module';

@Module({})
export class UserModule {
  static register(): DynamicModule {
    return {
      module: UserModule,
      imports: [UserMetadataModule.register()],
      controllers: [MeController],
    };
  }
}
