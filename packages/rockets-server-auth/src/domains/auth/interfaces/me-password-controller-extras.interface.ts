import { Type } from '@nestjs/common';

/**
 * Decorator factory shape — anything compatible with `@SetMetadata`,
 * `@UseGuards`, `@Throttle`, `@ApiTags`, custom decorators, etc.
 *
 * `ClassDecorator` is applied to the controller class itself.
 * `MethodDecorator` is applied to a specific route handler.
 */
export type RocketsAuthClassDecorator = ClassDecorator;
export type RocketsAuthMethodDecorator = MethodDecorator;

/**
 * Per-route extras for the `MePassword` gateway controller.
 *
 * Today the controller exposes a single route, `changePassword`. New routes
 * MUST add a key here with their own `decorators`, optional `useHandler`,
 * etc. — never silently grow the controller without updating the extras
 * surface.
 */
export interface MePasswordRouteExtras {
  /** Method decorators applied to the route (Throttle, ApiResponse, etc.). */
  decorators?: RocketsAuthMethodDecorator[];
}

export interface MePasswordControllerExtras {
  /** Class-level decorators (UseGuards, ApiTags, custom metadata). */
  classDecorators?: RocketsAuthClassDecorator[];
  /** Per-route extras keyed by route name. */
  routes?: {
    changePassword?: MePasswordRouteExtras;
  };
}

/**
 * Phase-1 acceptance: every gateway controller in this package SHOULD
 * accept this same triplet shape — `classDecorators`, `routes[*].decorators`,
 * and (where a backing handler exists) `routes[*].useHandler: Type<...>`.
 *
 * The `useHandler` slot is reserved for controllers whose request handlers
 * are factored into separate `@Injectable()` classes (the canonical pattern
 * documented in `.context/v8-ddd-refactor-plan.md` §2.8). The auth domain
 * keeps its handler logic in the CQRS command, so `useHandler` is unused
 * here — but the field is part of the contract for symmetry across
 * controllers.
 */
export type RocketsAuthRouteHandlerOverride = Type<unknown>;
