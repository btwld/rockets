import type { Type } from '@nestjs/common';
import { Operation } from '@concepta/nestjs-core';
import type {
  ResourceDtoConfig,
  ResourceHandlerOverrides,
  ResourceOperationName,
  ResourceOperationsObject,
  ResourceOperationConfig,
} from '../../../domain/interfaces/rockets-resource-definition.interface';
import type { InternalOperationOverride } from './internal-operation.types';

export function normalizeOperationsInput(
  resourceKey: string,
  input: readonly ResourceOperationName[] | ResourceOperationsObject,
  ctx: {
    dto: ResourceDtoConfig;
    handlers: ResourceHandlerOverrides;
  },
): {
  operations: readonly ResourceOperationName[];
  dto: ResourceDtoConfig;
  handlers: ResourceHandlerOverrides;
  operationOverrides: Partial<
    Record<ResourceOperationName, InternalOperationOverride>
  >;
} {
  if (Array.isArray(input)) {
    const enabled = new Set<ResourceOperationName>(input);
    const handlerToOp: Record<
      keyof ResourceHandlerOverrides,
      ResourceOperationName
    > = {
      list: Operation.List,
      read: Operation.Read,
      create: Operation.Create,
      update: Operation.Update,
      replace: Operation.Replace,
      delete: Operation.Delete,
      softDelete: Operation.SoftDelete,
      restore: Operation.Restore,
    };
    for (const slot of Object.keys(
      ctx.handlers,
    ) as (keyof ResourceHandlerOverrides)[]) {
      if (ctx.handlers[slot] && !enabled.has(handlerToOp[slot])) {
        throw new Error(
          `defineResource(${resourceKey}): handler declared for "${slot}" but operation "${handlerToOp[slot]}" is not in \`operations\`. ` +
            `Either enable the operation or remove the handler — handlers wired to no route never fire.`,
        );
      }
    }
    return {
      operations: input as readonly ResourceOperationName[],
      dto: ctx.dto,
      handlers: ctx.handlers,
      operationOverrides: {},
    };
  }

  const obj = input as ResourceOperationsObject;
  const operations: ResourceOperationName[] = [];
  const handlers: { -readonly [K in keyof ResourceHandlerOverrides]: Type } = {
    ...ctx.handlers,
  };
  const operationOverrides: Partial<
    Record<ResourceOperationName, InternalOperationOverride>
  > = {};

  const dto: { -readonly [K in keyof ResourceDtoConfig]: Type } = {
    ...ctx.dto,
  };

  if (!dto.response) {
    const declared = [obj.read?.output, obj.list?.output].filter(
      (r): r is Type => r !== undefined,
    );
    const allSame = declared.every((r) => r === declared[0]);
    if (declared.length > 0 && !allSame) {
      throw new Error(
        `defineResource(${resourceKey}): \`operations.read.output\` and \`operations.list.output\` differ. ` +
          `Declare \`dto.response\` explicitly at the resource level so the auto-paginated DTO and any op without its own output use the right shape.`,
      );
    }
    if (declared.length > 0) dto.response = declared[0];
  }
  if (!dto.create && obj.create?.input) dto.create = obj.create.input;
  if (!dto.update && obj.update?.input) dto.update = obj.update.input;
  if (!dto.replace && obj.replace?.input) dto.replace = obj.replace.input;

  const consumeCommon = (
    op: ResourceOperationName,
    cfg: ResourceOperationConfig | undefined,
    handlerSlot: keyof ResourceHandlerOverrides,
    label: string,
  ): void => {
    operations.push(op);
    if (!cfg) return;

    if (cfg.handler) handlers[handlerSlot] = cfg.handler;

    if (cfg.input !== undefined && cfg.requestOverride?.body !== undefined) {
      throw new Error(
        `defineResource(${resourceKey}): \`operations.${label}\` declares both \`input\` and \`requestOverride.body\`. ` +
          `Use one — \`input\` for the high-level shorthand or \`requestOverride.body\` when you also need \`requestOverride.params\`/\`requestOverride.query\` overrides.`,
      );
    }
    if (
      cfg.output !== undefined &&
      cfg.responseOverride !== undefined &&
      (cfg.responseOverride.resource !== undefined ||
        cfg.responseOverride.paginated !== undefined)
    ) {
      throw new Error(
        `defineResource(${resourceKey}): \`operations.${label}\` declares both \`output\` and \`responseOverride.resource/paginated\`. ` +
          `Use \`output\` for the simple case or \`responseOverride\` for the full upstream config — not both.`,
      );
    }

    const next: InternalOperationOverride = operationOverrides[op]
      ? { ...operationOverrides[op] }
      : {};
    if (cfg.path !== undefined) next.path = cfg.path;
    if (cfg.methodName !== undefined) next.methodName = cfg.methodName;
    if (cfg.transactional !== undefined) next.transactional = cfg.transactional;
    if (cfg.hooks !== undefined) next.hooks = cfg.hooks as readonly Type[];
    if (cfg.decorators !== undefined) next.extraDecorators = cfg.decorators;
    if (cfg.requestOverride !== undefined) next.request = cfg.requestOverride;
    if (cfg.responseOverride !== undefined)
      next.response = cfg.responseOverride;
    if (cfg.input !== undefined) {
      next.request = { ...(next.request ?? {}), body: cfg.input };
    }
    if (cfg.output !== undefined) {
      next.response = {
        ...(next.response ?? {}),
        resource: cfg.output,
        ...(cfg.paginated !== undefined ? { paginated: cfg.paginated } : {}),
      };
    }
    operationOverrides[op] = next;
  };

  if (obj.list) consumeCommon(Operation.List, obj.list, 'list', 'list');
  if (obj.read) consumeCommon(Operation.Read, obj.read, 'read', 'read');
  if (obj.create)
    consumeCommon(Operation.Create, obj.create, 'create', 'create');
  if (obj.update)
    consumeCommon(Operation.Update, obj.update, 'update', 'update');
  if (obj.replace)
    consumeCommon(Operation.Replace, obj.replace, 'replace', 'replace');

  if (obj.delete) {
    const op = obj.delete.soft ? Operation.SoftDelete : Operation.Delete;
    const slot: keyof ResourceHandlerOverrides = obj.delete.soft
      ? 'softDelete'
      : 'delete';
    consumeCommon(op, obj.delete, slot, 'delete');
    if (obj.delete.returnDeleted !== undefined) {
      const next: InternalOperationOverride = operationOverrides[op] ?? {};
      next.response = {
        ...(next.response ?? {}),
        returnDeleted: obj.delete.returnDeleted,
      };
      operationOverrides[op] = next;
    }
  }

  if (obj.restore) {
    if (!obj.delete?.soft) {
      throw new Error(
        `defineResource(${resourceKey}): \`operations.restore\` requires \`operations.delete: { soft: true }\`. ` +
          `Restore only applies to soft-deleted rows; with a hard delete there is nothing to restore.`,
      );
    }
    consumeCommon(Operation.Restore, obj.restore, 'restore', 'restore');
    if (obj.restore.returnRestored !== undefined) {
      const next: InternalOperationOverride =
        operationOverrides[Operation.Restore] ?? {};
      next.response = {
        ...(next.response ?? {}),
        returnRestored: obj.restore.returnRestored,
      };
      operationOverrides[Operation.Restore] = next;
    }
  }

  return {
    operations,
    dto,
    handlers,
    operationOverrides,
  };
}
