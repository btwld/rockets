/**
 * Resource planner — turns `resources: [...]` into Nest registration data.
 *
 * Implementation lives under `./planner/`; this file re-exports the public API.
 */
export type {
  AppRegistrationPlan,
  ResourceInput,
} from './planner/app-registration-plan.types';
export { isCrudResource } from './planner/app-registration-plan.types';
export { buildAppRegistrationPlan } from './planner/build-app-registration-plan';
