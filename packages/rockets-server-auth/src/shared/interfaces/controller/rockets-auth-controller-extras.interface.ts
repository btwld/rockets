import { Type } from '@nestjs/common';

/**
 * Canonical controller-extras shape used across every domain in
 * `rockets-server-auth`. Documented in
 * `.context/v8-ddd-refactor-plan.md` §2.8.
 *
 * `ClassDecorator` / `MethodDecorator` are TypeScript built-in types — any
 * NestJS decorator (`UseGuards`, `Throttle`, `ApiTags`, `SetMetadata`, …)
 * matches them.
 *
 * Each domain defines its own `<Domain>ControllerExtras` interface that
 * names its concrete `routes` keys; this base captures the contract.
 */
export interface RocketsAuthRouteExtrasBase {
  /** Method decorators applied to the route handler. */
  decorators?: MethodDecorator[];
}

export interface RocketsAuthControllerExtrasBase<RouteMap = unknown> {
  /** Class-level decorators applied to the built controller class. */
  classDecorators?: ClassDecorator[];

  /**
   * Per-route extras keyed by route name. Concrete domain extras tighten
   * `RouteMap` to their own enum / string literal union.
   */
  routes?: RouteMap;

  /**
   * Repo / lifecycle hooks to attach to the resource the controller drives.
   * Forwarded to `defineResource()` / `CrudModule.forFeature()` as
   * `controller.useHooks` for declarative resources, or applied at the
   * service layer for hand-built controllers.
   */
  useHooks?: Type<unknown>[];
}
