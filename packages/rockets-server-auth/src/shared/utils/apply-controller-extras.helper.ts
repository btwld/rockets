import { Type } from '@nestjs/common';
import { RocketsAuthControllerExtrasBase } from '../interfaces/controller/rockets-auth-controller-extras.interface';

/**
 * Apply consumer-supplied class- and per-route decorators to a freshly
 * built controller class. Used by every domain factory in
 * `gateways/http/factories/`.
 *
 * `routeMap` maps the public route key (consumer-facing — `accept`,
 * `revoke`, `changePassword`) to the actual method name on the class.
 */
export function applyControllerExtras<RouteMap extends Record<string, string>>(
  controllerClass: Type<unknown>,
  extras: RocketsAuthControllerExtrasBase<unknown>,
  routeMap: RouteMap,
): void {
  for (const decorator of extras.classDecorators ?? []) {
    decorator(controllerClass);
  }

  const routes =
    (extras.routes as
      | Record<string, { decorators?: MethodDecorator[] }>
      | undefined) ?? {};

  for (const [routeKey, methodName] of Object.entries(routeMap)) {
    const cfg = routes[routeKey];
    if (!cfg?.decorators?.length) continue;

    const proto = controllerClass.prototype as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
    if (!descriptor) continue;

    for (const decorator of cfg.decorators) {
      decorator(proto, methodName, descriptor);
    }
  }
}
