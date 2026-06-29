import type { Provider } from '@nestjs/common';
import type { CrudModuleForFeatureOptionsInterface } from '@concepta/nestjs-crud';

/**
 * Declarative resource configuration.
 *
 * Extends CrudModuleForFeatureOptionsInterface so the consumer passes
 * the CRUD config directly (controller, operations) without nesting.
 *
 * Handlers declared in crud operations (queryHandler/commandHandler) are
 * auto-extracted as providers. Additional providers can be declared in the
 * `providers` field and are registered + exported globally by the core.
 */
export interface RocketsResourceConfig
  extends CrudModuleForFeatureOptionsInterface {
  /** Providers specific to this resource — registered + exported by core */
  readonly providers?: Provider[];
}
