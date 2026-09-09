import { Operation } from '@concepta/nestjs-core';

import type { OperationHttpMethod } from '../../../domain/interfaces/operation-resource.interface';
import type { OperationResource } from '../../../domain/interfaces/operation-resource.interface';
import type { RocketsResourceConfig } from '../../../domain/interfaces/rockets-resource.interface';
import type { CrudResource } from '../../../domain/interfaces/rockets-resource-bundle.interface';
import {
  parseStructuredRoutePattern,
  structuredRoutePatternsMayOverlap,
  type StructuredRoutePattern,
} from './route-pattern';
import { HOST_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { operationDiscriminator } from '../operation-resource/build-operation-controller';
import { VERSION_NEUTRAL } from '@nestjs/common';
import { z } from 'zod';
import { readSchemaId } from '../../../common/utils/open-api-schema.util';

/**
 * Mirrors `@concepta/nestjs-crud` route defaults
 * (`CRUD_MODULE_ROUTE_*_DEFAULT_PATH`). Kept local because those constants
 * are not part of the package's public exports map.
 */
const CRUD_ID_PATH = ':id';
const CRUD_BULK_PATH = '/bulk';
const CRUD_RESTORE_PATH = '/restore/:id';

interface RouteClaim {
  readonly method: OperationHttpMethod;
  /** Human-readable path as declared. */
  readonly displayPath: string;
  readonly pattern: StructuredRoutePattern;
  readonly host?: string | RegExp | Array<string | RegExp>;
  readonly version?: unknown;
  readonly source: string;
}

const CRUD_ROUTE_DEFAULTS: Record<
  Operation,
  { readonly method: OperationHttpMethod; readonly path: string }
> = {
  [Operation.List]: { method: 'GET', path: '' },
  [Operation.Create]: { method: 'POST', path: '' },
  [Operation.CreateBatch]: {
    method: 'POST',
    path: CRUD_BULK_PATH,
  },
  [Operation.Read]: { method: 'GET', path: CRUD_ID_PATH },
  [Operation.Update]: {
    method: 'PATCH',
    path: CRUD_ID_PATH,
  },
  [Operation.Replace]: {
    method: 'PUT',
    path: CRUD_ID_PATH,
  },
  [Operation.Delete]: {
    method: 'DELETE',
    path: CRUD_ID_PATH,
  },
  [Operation.SoftDelete]: {
    method: 'DELETE',
    path: CRUD_ID_PATH,
  },
  [Operation.Restore]: {
    method: 'PATCH',
    path: CRUD_RESTORE_PATH,
  },
};

function joinPath(base: string, segment: string): string {
  const b = trimPathSlashes(base);
  const s = trimPathSlashes(segment);
  if (s.length === 0) {
    return b;
  }
  if (b.length === 0) {
    return s;
  }
  return `${b}/${s}`;
}

function trimPathSlashes(path: string): string {
  return path
    .split('/')
    .filter((part) => part.length > 0)
    .join('/');
}

function normalizeDimension(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(normalizeDimension).sort().join(',');
  }
  return String(value);
}

/**
 * Whether a routing dimension (`host` / `version`) can be proven to keep
 * two routes apart.
 *
 * Mirrors the `'unknown'` discipline of the route-pattern comparison: a
 * dimension separates routes only when literal values are provably
 * different. Anything this cannot decide counts as overlapping, because
 * the cost of guessing wrong here is a MISSED collision — two routes
 * silently last-wins at runtime — while the cost of over-reporting is a
 * boot error the author can resolve explicitly.
 */
function dimensionsMayOverlap(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) {
    return true;
  }
  // `VERSION_NEUTRAL` matches every version in Nest. Stringifying it
  // would compare a symbol description against '1' and wrongly report
  // the routes as disjoint.
  if (isVersionNeutral(a) || isVersionNeutral(b)) {
    return true;
  }
  // A RegExp or a pattern host (`:sub.example.com`, `*.example.com`)
  // cannot be compared by equality — Nest matches them structurally.
  if (isUndecidableDimension(a) || isUndecidableDimension(b)) {
    return true;
  }
  const left = new Set(
    Array.isArray(a) ? a.map(normalizeDimension) : [normalizeDimension(a)],
  );
  const right = Array.isArray(b)
    ? b.map(normalizeDimension)
    : [normalizeDimension(b)];
  return right.some((value) => left.has(value));
}

function isVersionNeutral(value: unknown): boolean {
  if (value === VERSION_NEUTRAL) return true;
  return (
    Array.isArray(value) && value.some((entry) => entry === VERSION_NEUTRAL)
  );
}

/** RegExp hosts and host patterns Nest matches structurally, not by value. */
function isUndecidableDimension(value: unknown): boolean {
  const entries = Array.isArray(value) ? value : [value];
  return entries.some(
    (entry) =>
      entry instanceof RegExp ||
      (typeof entry === 'string' && /[:*]/.test(entry)),
  );
}

function claimsMayOverlap(a: RouteClaim, b: RouteClaim): boolean {
  if (a.method !== b.method) {
    return false;
  }
  if (!dimensionsMayOverlap(a.host, b.host)) {
    return false;
  }
  if (!dimensionsMayOverlap(a.version, b.version)) {
    return false;
  }
  return structuredRoutePatternsMayOverlap(a.pattern, b.pattern) === true;
}

function expandBases(path: string | string[] | undefined): string[] {
  if (path === undefined) {
    return [''];
  }
  return Array.isArray(path) ? path : [path];
}

function collectCrudConfigRoutes(
  config: RocketsResourceConfig,
  sourceLabel: string,
): RouteClaim[] {
  const crud = config.crud;
  if (!('operations' in crud) || !Array.isArray(crud.operations)) {
    // Class-only CRUD options — no structured ops to inspect.
    return [];
  }
  if (!('path' in crud.controller) || crud.controller.path === undefined) {
    return [];
  }

  const claims: RouteClaim[] = [];
  const bases = expandBases(crud.controller.path);

  for (const op of crud.operations) {
    const defaults = CRUD_ROUTE_DEFAULTS[op.operation];
    if (defaults === undefined) {
      continue;
    }
    const segments = expandBases(op.path ?? defaults.path);
    for (const base of bases) {
      for (const segment of segments) {
        const displayPath = joinPath(String(base), String(segment));
        claims.push({
          method: defaults.method,
          displayPath,
          pattern: parseStructuredRoutePattern(displayPath),
          host: crud.controller.host,
          version: crud.controller.version,
          source: `${sourceLabel} (${op.operation})`,
        });
      }
    }
  }

  return claims;
}

/**
 * Route claims for one operation resource.
 *
 * `host` and `version` are read off the GENERATED controller rather than
 * assumed absent: an operation resource can carry arbitrary class and
 * method decorators, so `decorators: [Version('2')]` on an operation is a
 * legal way to sit beside a v1 CRUD route on the same path. Treating
 * those routes as a collision rejected a configuration Nest routes
 * perfectly well.
 *
 * Method-level version wins over the controller's, matching Nest.
 */
function collectOperationRoutes(bundle: OperationResource): RouteClaim[] {
  const claims: RouteClaim[] = [];
  const base = bundle.definition.path;
  const controller = bundle.controller;
  const controllerHost: unknown = Reflect.getMetadata(
    HOST_METADATA,
    controller,
  );
  const controllerVersion: unknown = Reflect.getMetadata(
    VERSION_METADATA,
    controller,
  );
  const prototype = controller.prototype as Record<string, unknown>;

  for (const operation of Object.values(bundle.definition.operations)) {
    const displayPath = joinPath(base, operation.path);
    const handler = prototype[operation.key];
    const methodVersion: unknown =
      typeof handler === 'function'
        ? Reflect.getMetadata(VERSION_METADATA, handler)
        : undefined;

    claims.push({
      method: operation.method,
      displayPath,
      pattern: parseStructuredRoutePattern(displayPath),
      host: controllerHost as RouteClaim['host'],
      version: methodVersion ?? controllerVersion,
      source: `operationResource("${base}").${operation.key}`,
    });
  }
  return claims;
}

/**
 * Fail-fast: reject structured route collisions across Rockets-owned CRUD/Sub
 * and operation resources at plan time (before Nest last-wins).
 *
 * This is intentionally not a universal app-route audit. It only sees routes
 * represented in `resources[]`; global prefix, Nest versioning strategy, and
 * hand-written controllers belong to the post-boot registered-route validator.
 */
/**
 * Rejects two operations that would produce the same OpenAPI
 * `operationId` — and therefore, on the zod path, the same generated DTO
 * component names.
 *
 * `operationDiscriminator` slugifies non-alphanumerics to `_`, which is
 * NOT injective: `{ key: 'run', path: 'a' }` and `{ key: 'run_a' }` both
 * yield `run_a`, as do paths `a/b` and `a-b`. Those routes are distinct,
 * so the path check above passes, and the second Swagger component then
 * silently overwrites the first.
 *
 * Asserting uniqueness directly is total, where making the slug
 * injective would be a guess. The discriminator stays a readability
 * optimisation rather than something correctness depends on.
 */
function validateOperationIdUniqueness(
  operationBundles: ReadonlyArray<OperationResource>,
): void {
  const seen = new Map<string, string>();
  for (const bundle of operationBundles) {
    const base = bundle.definition.path;
    const controllerName = controllerClassNameFor(base);
    for (const operation of Object.values(bundle.definition.operations)) {
      const id = `${controllerName}_${operation.method.toLowerCase()}_${operationDiscriminator(
        operation.key,
        operation.path,
      )}`;
      const source = `operationResource("${base}").${operation.key}`;
      const prior = seen.get(id);
      if (prior !== undefined) {
        throw new Error(
          `buildAppRegistrationPlan: operation id "${id}" is claimed by ` +
            `${prior} and ${source}. The two produce the same OpenAPI ` +
            `operationId and the same generated DTO names, so one schema ` +
            `would overwrite the other. Rename one operation key or give ` +
            `it an explicit path that does not slugify to the same value.`,
        );
      }
      seen.set(id, source);
    }
  }
}

/**
 * Rejects two DIFFERENT schema instances claiming one OpenAPI component
 * id across the CRUD and operation resources of the app.
 *
 * Ids are minted from resource names (`${Name}ResponseDto`, …) and by
 * consumers on hand-written schemas; two resources named alike, or a
 * consumer reusing a Rockets-shaped id, would put two shapes under one
 * component and the document would silently keep the last one written.
 * Keyed on schema IDENTITY: one schema reused as the output of several
 * operations is one component, no conflict. The document converter
 * repeats this check per document; catching it at plan time names the
 * resources instead of a route.
 */
function validateSchemaIdUniqueness(
  generatedResources: ReadonlyArray<CrudResource>,
  manualResources: ReadonlyArray<RocketsResourceConfig>,
  operationBundles: ReadonlyArray<OperationResource>,
): void {
  const seen = new Map<
    string,
    { readonly schema: z.ZodType; source: string }
  >();

  const claim = (schema: unknown, source: string): void => {
    if (!(schema instanceof z.ZodType)) return;
    const id = readSchemaId(schema);
    if (id === undefined) return;
    const prior = seen.get(id);
    if (prior !== undefined && prior.schema !== schema) {
      throw new Error(
        `buildAppRegistrationPlan: OpenAPI component "${id}" is claimed by ` +
          `two different schemas — ${prior.source} and ${source}. Both would ` +
          `occupy the same component, so one would overwrite the other. ` +
          `Reuse one schema instance, or give one of them a distinct name.`,
      );
    }
    seen.set(id, { schema, source });
  };

  const walk = (config: RocketsResourceConfig, label: string): void => {
    const crud = config.crud;
    const controller = crud.controller;
    if ('class' in controller) return;
    claim(controller.response?.resource, label);
    claim(controller.response?.paginated, label);
    claim(controller.request?.body, label);
    if (!('operations' in crud) || !Array.isArray(crud.operations)) return;
    for (const op of crud.operations) {
      const source = `${label} (${op.operation})`;
      claim(op.request?.body, source);
      claim(op.response?.resource, source);
      claim(op.response?.paginated, source);
    }
  };

  for (const resource of generatedResources) {
    walk(resource.core, `defineResource(${resource.meta.key})`);
  }
  for (const [index, config] of manualResources.entries()) {
    walk(config, `manualResources[${index}]`);
  }
  // `operationDiscriminator` slugifies non-alphanumerics, so `foo-bar` and
  // `fooBar` are distinct routes that mint ONE component name: claiming
  // the schemas here is what turns that into a boot error instead of a
  // silently overwritten document. Params schemas are never named.
  for (const bundle of operationBundles) {
    const base = bundle.definition.path;
    for (const operation of Object.values(bundle.definition.operations)) {
      const source = `operationResource("${base}").${operation.key}`;
      claim(operation.inputSchema, source);
      if (operation.output !== false) claim(operation.output, source);
    }
  }
}

/** Mirrors `controllerClassName` in the operation-resource builder. */
function controllerClassNameFor(path: string): string {
  const slug = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `OperationResource_${slug || 'root'}`;
}

export function validateStructuredRouteCollisions(args: {
  readonly generatedResources: ReadonlyArray<CrudResource>;
  readonly manualResources: ReadonlyArray<RocketsResourceConfig>;
  readonly operationBundles: ReadonlyArray<OperationResource>;
}): void {
  validateOperationIdUniqueness(args.operationBundles);
  validateSchemaIdUniqueness(
    args.generatedResources,
    args.manualResources,
    args.operationBundles,
  );

  // No early return on an operation-free app: the check covers
  // CRUD-vs-CRUD and CRUD-vs-sub-resource collisions too, and gating it
  // on "any operation bundle exists" meant two CRUD bundles claiming
  // one route booted clean — until an UNRELATED operation resource was
  // added elsewhere and the pre-existing overlap surfaced as a boot
  // failure that looked caused by the new code.
  const claims: RouteClaim[] = [];

  for (const resource of args.generatedResources) {
    claims.push(
      ...collectCrudConfigRoutes(
        resource.core,
        `defineResource(${resource.meta.key})`,
      ),
    );
  }

  for (const [index, config] of args.manualResources.entries()) {
    claims.push(
      ...collectCrudConfigRoutes(config, `manualResources[${index}]`),
    );
  }

  for (const bundle of args.operationBundles) {
    claims.push(...collectOperationRoutes(bundle));
  }

  for (const [index, claim] of claims.entries()) {
    for (const prior of claims.slice(0, index)) {
      if (!claimsMayOverlap(claim, prior)) {
        continue;
      }
      throw new Error(
        `buildAppRegistrationPlan: duplicate route ${claim.method} ` +
          `"/${claim.displayPath}" claimed by ${claim.source} and ` +
          `${prior.source}`,
      );
    }
  }
}

export const validateRouteCollisions = validateStructuredRouteCollisions;
