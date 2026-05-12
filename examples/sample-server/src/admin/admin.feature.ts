import { defineModuleResource } from '@bitwild/rockets-core';
import { AdminGuard } from './admin.guard';
import { AdminPetController } from './admin-pet.controller';
import { AdminPetService } from './admin-pet.service';

/**
 * Admin feature: ships the cross-cutting `AdminGuard` plus the
 * admin-only `/admin/pets` controller.
 *
 * Only `AdminGuard` is exported — `audit-log.controller.ts`
 * (`@UseGuards(AdminGuard)`) is the single cross-feature consumer.
 * `AdminPetService` stays internal: only `AdminPetController` injects
 * it, both inside this bundle.
 */
export const adminFeature = defineModuleResource({
  controllers: [AdminPetController],
  providers: [AdminGuard, AdminPetService],
  exports: [AdminGuard],
});
