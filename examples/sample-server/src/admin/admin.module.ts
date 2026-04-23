import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminPetController } from './admin-pet.controller';
import { AdminPetService } from './admin-pet.service';

@Module({
  controllers: [AdminPetController],
  providers: [AdminGuard, AdminPetService],
  exports: [AdminGuard, AdminPetService],
})
export class AdminModule {}
