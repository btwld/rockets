import type { PlainLiteralObject, Provider } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { Operation, UseHooks } from '@bitwild/rockets-app';
import {
  CrudListQuery,
  CrudReadQuery,
  CrudCreateCommand,
  CrudUpdateCommand,
  CrudReplaceCommand,
  CrudDeleteCommand,
  CrudSoftDeleteCommand,
  CrudRestoreCommand,
  CrudJoin,
  type CrudOperationOptions,
  type CrudRequestConfig,
  type CrudResponseConfig,
} from '@bitwild/rockets-crud';
import type { JoinClause } from '@bitwild/rockets-repository';
import type {
  ResourceDtoConfig,
  ResourceHandlerOverrides,
  ResourceOperationName,
} from '../../../domain/interfaces/rockets-resource-definition.interface';
import type { RocketsEntityHookForResource } from '../../hooks/entity-hook';
import type { InternalOperationOverride } from './internal-operation.types';

type CrudDecorator = ReturnType<typeof applyDecorators>;

interface BuildOperationArgs {
  readonly dto: ResourceDtoConfig;
  readonly joins: readonly JoinClause[] | undefined;
  readonly handlers: ResourceHandlerOverrides;
  readonly override: InternalOperationOverride | undefined;
}

export function buildOperation(
  op: ResourceOperationName,
  args: BuildOperationArgs,
): CrudOperationOptions<PlainLiteralObject> {
  const { dto, joins, handlers, override = {} } = args;
  const extraDecorators = buildOperationDecorators({ op, joins, override });

  switch (op) {
    case Operation.List:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        query: override.query ?? CrudListQuery,
        ...(handlers.list ? { queryHandler: handlers.list } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Read:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        query: override.query ?? CrudReadQuery,
        ...(handlers.read ? { queryHandler: handlers.read } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Create:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        ...(override.request === undefined && dto.create
          ? { request: { body: dto.create } }
          : {}),
        command: override.command ?? CrudCreateCommand,
        ...(handlers.create ? { commandHandler: handlers.create } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Update:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        ...(override.request === undefined && dto.update
          ? { request: { body: dto.update } }
          : {}),
        command: override.command ?? CrudUpdateCommand,
        ...(handlers.update ? { commandHandler: handlers.update } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Replace:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        ...(override.request === undefined && dto.replace
          ? { request: { body: dto.replace } }
          : {}),
        command: override.command ?? CrudReplaceCommand,
        ...(handlers.replace ? { commandHandler: handlers.replace } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Delete:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        command: override.command ?? CrudDeleteCommand,
        ...(handlers.delete ? { commandHandler: handlers.delete } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.SoftDelete:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        command: override.command ?? CrudSoftDeleteCommand,
        ...(handlers.softDelete ? { commandHandler: handlers.softDelete } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Restore:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        command: override.command ?? CrudRestoreCommand,
        ...(handlers.restore ? { commandHandler: handlers.restore } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;
  }
}

function optionalEnvelope(
  override: InternalOperationOverride,
  extraDecorators: CrudDecorator[],
): {
  path?: string | string[];
  methodName?: string;
  transactional?: boolean;
  request?: CrudRequestConfig<PlainLiteralObject>;
  response?: CrudResponseConfig;
  extraDecorators?: CrudDecorator[];
} {
  return {
    ...(override.path !== undefined && { path: override.path }),
    ...(override.methodName !== undefined && {
      methodName: override.methodName,
    }),
    ...(override.transactional !== undefined && {
      transactional: override.transactional,
    }),
    ...(override.request !== undefined && { request: override.request }),
    ...(override.response !== undefined && { response: override.response }),
    ...(extraDecorators.length && { extraDecorators }),
  };
}

function buildOperationDecorators(args: {
  op: ResourceOperationName;
  joins: readonly JoinClause[] | undefined;
  override: InternalOperationOverride;
}): CrudDecorator[] {
  const decorators: CrudDecorator[] = [];

  if (
    args.joins?.length &&
    (args.op === Operation.List || args.op === Operation.Read)
  ) {
    decorators.push(applyDecorators(CrudJoin([...args.joins])));
  }

  if (args.override.hooks?.length) {
    decorators.push(applyDecorators(UseHooks(...args.override.hooks)));
  }

  if (args.override.extraDecorators?.length) {
    for (const d of args.override.extraDecorators) {
      decorators.push(applyDecorators(d));
    }
  }

  return decorators;
}

export function mergeProviders<E extends PlainLiteralObject>(args: {
  handlers: ResourceHandlerOverrides;
  hooks: readonly RocketsEntityHookForResource<E>[] | undefined;
  extra: readonly Provider[];
  autoRegisterHandlers: boolean;
}): Provider[] {
  const seen = new Set<Provider>();
  const out: Provider[] = [];
  const add = (p: Provider | undefined): void => {
    if (!p) return;
    if (seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  if (args.autoRegisterHandlers) {
    const { handlers } = args;
    add(handlers.list);
    add(handlers.read);
    add(handlers.create);
    add(handlers.update);
    add(handlers.replace);
    add(handlers.delete);
    add(handlers.softDelete);
    add(handlers.restore);

    for (const hook of args.hooks ?? []) add(hook);
  }
  for (const p of args.extra) add(p);

  return out;
}
