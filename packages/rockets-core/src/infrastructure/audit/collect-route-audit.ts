import {
  RequestMethod,
  StandardSchemaValidationPipe,
  type Type,
} from '@nestjs/common';
import {
  HOST_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  PIPES_METADATA,
  ROUTE_ARGS_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { CLASS_SERIALIZER_OPTIONS } from '@nestjs/common/serializer/class-serializer.constants';
import { z } from 'zod';
import { DECORATORS } from '@nestjs/swagger';
import { CrudEntity } from '@concepta/nestjs-crud';
import { isAuthPublic } from '@concepta/nestjs-authentication';

import { findOpenResponseObject } from '../../common/utils/open-api-schema.util';
import { hasHiddenResponseField } from '../../zod/zod-projections';

import { ROCKETS_AUTH_SESSION_TOKEN } from '../../decorators/auth-session.decorator';
import { aclMetadataKeys } from './acl-metadata-keys';
import type {
  RouteAuditEntry,
  RouteAuthState,
  RouteAuditReport,
} from './route-audit.types';

/** One discovered controller class plus the methods to inspect. */
export interface ControllerScan {
  readonly controller: Type<unknown>;
  readonly methodNames: readonly string[];
}

const METHOD_NAMES: Readonly<Record<number, string>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
  [RequestMethod.SEARCH]: 'SEARCH',
};

/**
 * Builds the route report from already-discovered controllers.
 *
 * Pure on purpose: the Nest-facing service supplies the controller list
 * and the guard summary, so every judgement this makes is testable
 * without booting an application.
 *
 * The authentication state mirrors `AuthServerGuard` exactly — same
 * metadata key, same `true | 'classLevel'` sentinel handling. A report
 * that decided "public" by its own rules would be a second source of
 * truth, and the point of this audit is that there is only one.
 *
 * `authGuardPresent` — not "some global guard exists" — is what decides
 * `guarded`. A `ThrottlerGuard`, an ACL guard, or upstream
 * access-control's disabled-guard factory (which registers `APP_GUARD`
 * unconditionally and resolves to `null` when `appGuard: false`) do not
 * authenticate anything, and counting them once reported an app with
 * ZERO authentication as fully guarded.
 */
export function collectRouteAudit(args: {
  readonly controllers: readonly ControllerScan[];
  /** Every resolved global guard, for the report. */
  readonly globalGuards: readonly string[];
  /** Names of the guards recognised as AUTHENTICATION guards. */
  readonly authGuards: readonly string[];
  /** Names of the guards recognised as CSRF guards, for `requireCsrf`. */
  readonly csrfGuards?: readonly string[];
}): RouteAuditReport {
  const appIsUnguarded = args.authGuards.length === 0;
  const routes: RouteAuditEntry[] = [];

  for (const { controller, methodNames } of args.controllers) {
    const basePaths = readPaths(controller);
    const classPublic = isAuthPublic(controller);

    for (const methodName of methodNames) {
      const handler = readHandler(controller, methodName);
      if (handler === undefined) continue;

      const httpMethod = readHttpMethod(handler);
      if (httpMethod === undefined) continue;

      const method = METHOD_NAMES[httpMethod] ?? String(httpMethod);
      const authentication = resolveAuth(
        isAuthPublic(handler),
        classPublic,
        appIsUnguarded,
      );
      const sessionAuth = isSession(
        readSession(handler),
        readSession(controller),
      );
      if (
        sessionAuth &&
        (authentication === 'public' || authentication === 'public-class')
      ) {
        throw new Error(
          `${controller.name}.${methodName}: declares both @AuthPublic ` +
            `and @AuthSession — a public route has no session to protect. ` +
            `Pick one.`,
        );
      }

      // A controller or handler declared with an ARRAY of paths
      // registers one wire route per combination; the report carries
      // one row per combination too, or the table understates the
      // surface it exists to describe.
      // Version and host are REAL routing dimensions: a public v1 and a
      // guarded v2 of the same METHOD+path are different wire routes,
      // and collapsing them to one id let a single `allow` entry exempt
      // BOTH — the silently-widening exemption the docs forbid (review
      // round 4). The qualifier is part of the identity whenever the
      // dimension is declared.
      const version = readVersion(handler) ?? readVersion(controller);
      const host = readHost(controller);
      const unvalidatedSchemaParams = readUnvalidatedSchemaParams(
        controller,
        handler,
        methodName,
      );
      const openResponseSchema = readOpenResponseSchema(controller, handler);
      const hiddenResponseField = readHiddenResponseField(controller, handler);
      const unvalidatedCrudBody = readUnvalidatedCrudBody(
        controller,
        methodName,
      );
      const unserializedResponseSchemas = readUnserializedResponseSchemas(
        controller,
        handler,
      );
      const qualifier =
        (version !== undefined ? ` [v${version}]` : '') +
        (host !== undefined ? ` [host:${host}]` : '');

      for (const base of basePaths) {
        for (const segment of readPaths(handler)) {
          const path = joinPath(base, segment);
          routes.push({
            id: `${method} /${path}${qualifier}`,
            method,
            path: `/${path}`,
            controller: controller.name,
            controllerRef: controller,
            handler: methodName,
            authentication,
            sessionAuth,
            openResponseSchema,
            hiddenResponseField,
            unvalidatedCrudBody,
            unserializedResponseSchemas,
            // Grants mirror enforcement exactly: upstream reads them
            // with `reflector.get(..., getHandler())` — handler ONLY.
            aclAction: readGrantField(handler, 'action'),
            aclResource: readGrantField(handler, 'resource'),
            // Queries do NOT: upstream merges `[class, handler]`
            // (`check-access.handler.js:68`), so a class-level
            // AccessControlQuery is enforced at runtime — auditing only
            // the handler reported it null and `requireAclQuery`
            // aborted the boot of a correctly-enforced app.
            aclQuery: readQueryService(handler) ?? readQueryService(controller),
            unvalidatedSchemaParams,
          });
        }
      }
    }
  }

  return {
    routes,
    globalGuards: args.globalGuards,
    authGuards: args.authGuards,
    csrfGuards: args.csrfGuards ?? [],
  };
}

/**
 * An app with no AUTHENTICATION guard cannot authenticate anything, so
 * no route is reported `guarded` — an explicit `AuthPublic` still reads
 * as the author's intent and is preserved.
 */
function resolveAuth(
  handlerPublic: boolean,
  classPublic: boolean,
  appIsUnguarded: boolean,
): RouteAuthState {
  if (handlerPublic) return 'public';
  if (classPublic) return 'public-class';
  return appIsUnguarded ? 'unguarded-app' : 'guarded';
}

function readSession(target: object): unknown {
  return Reflect.getMetadata(ROCKETS_AUTH_SESSION_TOKEN, target);
}

/** Same `true | 'classLevel'` sentinel shape upstream `AuthPublic` uses. */
function isSession(handlerValue: unknown, classValue: unknown): boolean {
  return (
    handlerValue === true ||
    handlerValue === 'classLevel' ||
    classValue === true ||
    classValue === 'classLevel'
  );
}

/** Declared Nest version(s), joined deterministically; undefined when none. */
function readVersion(target: object): string | undefined {
  const value: unknown = Reflect.getMetadata(VERSION_METADATA, target);
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [value];
  const parts = list.map((entry) =>
    typeof entry === 'symbol' ? 'neutral' : String(entry),
  );
  return parts.length > 0 ? parts.sort().join(',') : undefined;
}

function readHost(target: object): string | undefined {
  const value: unknown = Reflect.getMetadata(HOST_METADATA, target);
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [value];
  return list.map(String).sort().join(',') || undefined;
}

function readHandler(
  controller: Type<unknown>,
  methodName: string,
): ((...args: unknown[]) => unknown) | undefined {
  const prototype: unknown = controller.prototype;
  if (typeof prototype !== 'object' || prototype === null) return undefined;
  const handler: unknown = Reflect.get(prototype, methodName);
  return typeof handler === 'function'
    ? (handler as (...args: unknown[]) => unknown)
    : undefined;
}

function readHttpMethod(handler: object): number | undefined {
  const value: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
  return typeof value === 'number' ? value : undefined;
}

/** All declared paths — a string, an array of strings, or none. */
function readPaths(target: object): string[] {
  const value: unknown = Reflect.getMetadata(PATH_METADATA, target);
  const raw = Array.isArray(value) ? value : [value];
  const paths = raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map(trimSlashes);
  return paths.length > 0 ? paths : [''];
}

/**
 * Reads one field from the grant metadata.
 *
 * Upstream stores an array — a handler can carry several grants — and
 * the shapes differ per decorator. Only fields actually present are
 * reported; anything else stays `null` rather than being invented.
 */
function readGrantField(handler: object, field: string): string | null {
  const value: unknown = Reflect.getMetadata(aclMetadataKeys().grant, handler);
  const grants = Array.isArray(value)
    ? value
    : value === undefined
    ? []
    : [value];

  for (const grant of grants) {
    if (typeof grant !== 'object' || grant === null) continue;
    const field_ = Reflect.get(grant, field);
    if (typeof field_ === 'string') return field_;
  }
  return null;
}

function readQueryService(handler: object): string | null {
  const value: unknown = Reflect.getMetadata(aclMetadataKeys().query, handler);
  const entries = Array.isArray(value)
    ? value
    : value === undefined
    ? []
    : [value];

  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const service: unknown = Reflect.get(entry, 'service');
    if (typeof service === 'function' && typeof service.name === 'string') {
      return service.name;
    }
  }
  return null;
}

/**
 * Parameters declaring a `schema` that no `StandardSchemaValidationPipe`
 * reaches. Nest resolves a parameter through global pipes, route pipes
 * and param pipes and nothing else (`router-execution-context.js`,
 * `createPipesFn`): `schema` alone installs no validator. Global pipes are
 * not consulted here on purpose — `SchemaValidatorConflictCheck` rejects a
 * global Standard Schema pipe, so per-route is the only place one can be.
 */
function readUnvalidatedSchemaParams(
  controller: Type<unknown>,
  handler: object,
  methodName: string,
): string[] {
  // Nest keys route-argument metadata by method name on the CLASS, not
  // on the handler function.
  const args: unknown = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    controller,
    methodName,
  );
  if (typeof args !== 'object' || args === null) return [];

  const routePipes = [...readPipes(controller), ...readPipes(handler)];
  const missing: Array<{ index: number; label: string }> = [];

  for (const [key, entry] of Object.entries(args)) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (Reflect.get(entry, 'schema') === undefined) continue;

    const own: unknown = Reflect.get(entry, 'pipes');
    const paramPipes = Array.isArray(own) ? own : [];
    if ([...routePipes, ...paramPipes].some(isStandardSchemaPipe)) continue;

    const index: unknown = Reflect.get(entry, 'index');
    const data: unknown = Reflect.get(entry, 'data');
    missing.push({
      index: typeof index === 'number' ? index : Number.MAX_SAFE_INTEGER,
      label: paramLabel(key, data),
    });
  }

  return missing.sort((a, b) => a.index - b.index).map((m) => m.label);
}

/** The zod schema a route serializes with (handler over class, as Nest resolves it). */
function readSerializerSchema(
  controller: Type<unknown>,
  handler: object,
): z.ZodType | undefined {
  const options: unknown =
    Reflect.getMetadata(CLASS_SERIALIZER_OPTIONS, handler) ??
    Reflect.getMetadata(CLASS_SERIALIZER_OPTIONS, controller);
  if (typeof options !== 'object' || options === null) return undefined;
  const schema: unknown = Reflect.get(options, 'schema');
  return schema instanceof z.ZodType ? schema : undefined;
}

function readHiddenResponseField(
  controller: Type<unknown>,
  handler: object,
): boolean {
  const schema = readSerializerSchema(controller, handler);
  return schema === undefined
    ? false
    : hasHiddenResponseField(schema, `${controller.name}.serializer`);
}

/**
 * A hand-written route serializes with `@SerializeOptions({ schema })`
 * (handler wins over class, like Nest resolves it). Its schema gets the
 * same fail-closed check a generated resource's response schema gets at
 * definition time — reported here, failed at boot by the service.
 */
function readOpenResponseSchema(
  controller: Type<unknown>,
  handler: object,
): string | null {
  const schema = readSerializerSchema(controller, handler);
  return schema === undefined ? null : findOpenResponseObject(schema) ?? null;
}

/**
 * Generated CRUD only (the controller carries upstream's entity metadata):
 * a handler whose `@Body()` parameter has no schema. Upstream's
 * `CrudInitValidation` reads the OPERATION-level body; a controller-level
 * `request.body` leaves the parameter schema-less and unvalidated while
 * `CrudInitApiBody` (class hierarchy) still documents it.
 */
function readUnvalidatedCrudBody(
  controller: Type<unknown>,
  methodName: string,
): boolean {
  // Upstream stamps its entity on the controller class through
  // `CrudMetadata.createDecorator` (Nest's `ReflectableDecorator` shape:
  // the metadata key is `decorator.KEY`). Only create / update / replace /
  // batch handlers of a generated controller carry a `@Body()` at all, so
  // "a body parameter without a schema" is the whole test.
  if (Reflect.getMetadata(CrudEntity.KEY, controller) === undefined) {
    return false;
  }
  const args: unknown = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    controller,
    methodName,
  );
  if (typeof args !== 'object' || args === null) return false;
  const bodyPrefix = `${RouteParamtypes.BODY}:`;
  return Object.entries(args).some(
    ([key, entry]) =>
      key.startsWith(bodyPrefix) &&
      typeof entry === 'object' &&
      entry !== null &&
      Reflect.get(entry, 'schema') === undefined,
  );
}

/**
 * Statuses documented with `standardSchema` (handler entries over class
 * entries, like Swagger merges them) on a route that serializes through no
 * `@SerializeOptions({ schema })`.
 */
function readUnserializedResponseSchemas(
  controller: Type<unknown>,
  handler: object,
): string[] {
  if (readSerializerSchema(controller, handler) !== undefined) {
    return [];
  }
  const classResponses: unknown = Reflect.getMetadata(
    DECORATORS.API_RESPONSE,
    controller,
  );
  const handlerResponses: unknown = Reflect.getMetadata(
    DECORATORS.API_RESPONSE,
    handler,
  );
  const merged: Record<string, unknown> = {
    ...(typeof classResponses === 'object' && classResponses !== null
      ? classResponses
      : {}),
    ...(typeof handlerResponses === 'object' && handlerResponses !== null
      ? handlerResponses
      : {}),
  };
  return Object.entries(merged)
    .filter(
      ([, entry]) =>
        typeof entry === 'object' &&
        entry !== null &&
        Reflect.get(entry, 'standardSchema') instanceof z.ZodType,
    )
    .map(([status]) => status);
}

function readPipes(target: object): unknown[] {
  const value: unknown = Reflect.getMetadata(PIPES_METADATA, target);
  return Array.isArray(value) ? value : [];
}

/** `@UsePipes` accepts instances and classes; both count, subclasses too. */
function isStandardSchemaPipe(pipe: unknown): boolean {
  if (pipe instanceof StandardSchemaValidationPipe) return true;
  return (
    typeof pipe === 'function' &&
    (pipe === StandardSchemaValidationPipe ||
      pipe.prototype instanceof StandardSchemaValidationPipe)
  );
}

/** Metadata key "3:0" reads as body; "4:1" with data "page" as query('page'). */
function paramLabel(metadataKey: string, data: unknown): string {
  const paramtype = Number(metadataKey.split(':')[0]);
  const kind: unknown = RouteParamtypes[paramtype];
  const name = typeof kind === 'string' ? kind.toLowerCase() : 'param';
  return typeof data === 'string' && data.length > 0
    ? `${name}('${data}')`
    : name;
}

function joinPath(base: string, segment: string): string {
  if (!segment) return base;
  if (!base) return segment;
  return `${base}/${segment}`;
}

function trimSlashes(path: string): string {
  return path
    .split('/')
    .filter((part) => part.length > 0)
    .join('/');
}
