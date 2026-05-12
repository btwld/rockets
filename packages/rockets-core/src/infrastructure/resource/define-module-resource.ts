import type { DynamicModule, Provider } from '@nestjs/common';
import {
  normaliseModuleResourceEntity,
  type ModuleResourceEntityInput,
  type ModuleResource,
} from '../../domain/interfaces/module-resource.interface';
import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';

/**
 * Input accepted by {@link defineModuleResource}.
 *
 * `entities` is optional so consumers can express pure Nest-wiring
 * resources (CQRS handlers reusing repos owned elsewhere). At least one of
 * `entities` or the Nest slice fields must contribute something useful —
 * both empty is a misconfiguration that startup validation will surface,
 * but is not caught here to keep this helper a pure constructor.
 */
export interface DefineModuleResourceInput {
  /**
   * Persistence rows. Accepts the full `{ key, entity, repository? }`
   * shape or a bare class (key derived from class name — strip
   * trailing `Entity`, lowercase first char).
   */
  readonly entities?: ReadonlyArray<ModuleResourceEntityInput>;
  readonly imports?: NonNullable<DynamicModule['imports']>;
  readonly controllers?: NonNullable<DynamicModule['controllers']>;
  readonly providers?: ReadonlyArray<Provider>;
  readonly exports?: NonNullable<DynamicModule['exports']>;
}

/**
 * Build a {@link ModuleResource} for `RocketsCoreModule`'s
 * `resources[]`.
 *
 * Pair with `defineResource()`: use `defineResource` when the resource is
 * a CRUD-shaped HTTP surface; use `defineModuleResource` when the resource
 * needs persistence keys + Nest wiring (controllers/services/CQRS) but
 * not the auto-generated CRUD controller.
 *
 * @example
 * Input → output (what core consumes):
 *
 * ```ts
 * // Input
 * const authFeature = defineModuleResource({
 *   entities: [UserEntity],          // class shorthand → key 'user'
 *   controllers: [AuthController],
 *   providers: [SampleAuthAdapter],
 *   exports: [SampleAuthAdapter],
 * });
 *
 * // Output (passed to RocketsCoreModule via `resources: [authFeature]`)
 * {
 *   kind: ResourceKind.Module,
 *   entities: [{ key: 'user', entity: UserEntity }],
 *   controllers: [AuthController],
 *   providers: [SampleAuthAdapter],
 *   exports: [SampleAuthAdapter],
 *   imports: undefined,
 * }
 *
 * // What gets wired at boot:
 * //  • One row appended to RepositoryModule.forFeature plan
 * //    ({ key: 'user', entity: UserEntity })
 * //  • One inline DynamicModule materialised with the
 * //    controllers/providers/exports/imports slice
 * ```
 */
export function defineModuleResource(
  input: DefineModuleResourceInput,
): ModuleResource {
  return {
    kind: ResourceKind.Module,
    entities: (input.entities ?? []).map(normaliseModuleResourceEntity),
    imports: input.imports,
    controllers: input.controllers,
    providers: input.providers,
    exports: input.exports,
  };
}

/**
 * Type guard for `ModuleResource`.
 *
 * Used by `buildAppRegistrationPlan` to split a mixed `resources[]`
 * into CRUD resources, module resources, and manual configs.
 */
export function isModuleResource(value: unknown): value is ModuleResource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === ResourceKind.Module
  );
}
