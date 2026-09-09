/**
 * Decorator factory shape — anything compatible with `@SetMetadata`,
 * `@UseGuards`, `@RateLimit`, `@ApiTags`, custom decorators, etc.
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
  /** Method decorators applied to the route (RateLimit, ApiResponse, etc.). */
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
