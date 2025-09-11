import { Global, Module } from '@nestjs/common';
import { UserModelServiceFixture } from './user-model.service.fixture';
import { UserControllerFixtures } from './user.controller.fixture';

@Global()
@Module({
  controllers: [UserControllerFixtures],
  providers: [UserModelServiceFixture],
  exports: [UserModelServiceFixture],
})
export class UserModuleFixture {}
