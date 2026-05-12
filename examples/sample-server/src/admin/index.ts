// Public surface of the admin feature.
//
// `adminFeature` is the wiring entry-point — push it into
// `RocketsModule.forRoot({ resources: [...] })`.
// `AdminGuard` is re-exported so cross-feature controllers can
// reach for `@UseGuards(AdminGuard)` via the barrel.
//
// `AdminPetController` and `AdminPetService` stay internal.
export { AdminGuard } from './admin.guard';
export { adminFeature } from './admin.feature';
