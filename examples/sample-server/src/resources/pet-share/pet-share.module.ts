import { Module } from '@nestjs/common';
import { PetShareController } from './pet-share.controller';
import { PetShareService } from './pet-share.service';
import { PetOwnerOrSharedHook } from './pet-owner-or-shared.hook';

@Module({
  controllers: [PetShareController],
  providers: [PetShareService, PetOwnerOrSharedHook],
  exports: [PetShareService, PetOwnerOrSharedHook],
})
export class PetShareModule {}
