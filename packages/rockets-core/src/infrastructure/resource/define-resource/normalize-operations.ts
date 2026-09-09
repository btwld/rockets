import { assertNoHiddenFields } from '../../../zod/zod-projections';
import type { Type } from '@nestjs/common';
import { Operation } from '@concepta/nestjs-core';
import type { z } from 'zod';
import {
  assertFailClosedResponse,
  assertNamedSchema,
  buildPaginatedSchema,
} from '../../../common/utils/open-api-schema.util';
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

  const dto: { -readonly [K in keyof ResourceDtoConfig]: z.ZodType } = {
    ...ctx.dto,
  };

  if (!dto.response) {
    // Resource-level default for operations that declare no `output` of
    // their own (and the base the auto-paginated schema is built from).
    // `read` is the canonical single-item shape, so it wins over `list`.
    // Operations that DO declare an `output` are unaffected — the route
    // carries its own response metadata (see `buildOperationDecorators`).
    dto.response = obj.read?.output ?? obj.list?.output;
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
    if (cfg.acl !== undefined) next.acl = cfg.acl;
    if (cfg.path !== undefined) next.path = cfg.path;
    if (cfg.methodName !== undefined) next.methodName = cfg.methodName;
    if (cfg.transactional !== undefined) next.transactional = cfg.transactional;
    if (cfg.hooks !== undefined) next.hooks = cfg.hooks as readonly Type[];
    if (cfg.decorators !== undefined) next.extraDecorators = cfg.decorators;
    if (cfg.requestOverride !== undefined) {
      // `input` is checked below; the escape hatch reaches the same
      // request body and must clear the same bar (rule 6 — every wire
      // shape is a named component). Without this an unnamed schema
      // here documents inline while every sibling body is a `$ref`.
      if (cfg.requestOverride.body !== undefined) {
        assertNamedSchema(
          cfg.requestOverride.body,
          `defineResource(${resourceKey}): operations.${label}.requestOverride.body`,
        );
      }
      if (cfg.requestOverride.bodyBatch !== undefined) {
        assertNamedSchema(
          cfg.requestOverride.bodyBatch,
          `defineResource(${resourceKey}): operations.${label}.requestOverride.bodyBatch`,
        );
      }
      next.request = cfg.requestOverride;
    }
    if (cfg.responseOverride !== undefined) {
      // Same bar as `output` / `paginated`: the escape hatch is handed to
      // `buildOperationDecorators` as the serializer, so a schema that
      // reaches the wire through here must be a named component, must
      // strip undeclared keys, and must not carry a column the resource
      // declared hidden. Without this, the one config path that skips
      // every response check was the one meant for the hardest cases.
      // `collection` is declared by the upstream config type but read
      // nowhere in `@concepta/nestjs-crud`, so it reaches no response and
      // is not checked here — add it the moment upstream consumes it.
      for (const slot of ['resource', 'paginated'] as const) {
        const schema = cfg.responseOverride[slot];
        if (schema === undefined) continue;
        const context = `defineResource(${resourceKey}): operations.${label}.responseOverride.${slot}`;
        assertNamedSchema(schema, context);
        assertFailClosedResponse(schema, context);
        assertNoHiddenFields(schema, context);
      }
      next.response = cfg.responseOverride;
    }
    if (cfg.input !== undefined) {
      assertNamedSchema(
        cfg.input,
        `defineResource(${resourceKey}): operations.${label}.input`,
      );
      next.request = { ...(next.request ?? {}), body: cfg.input };
    }
    // A list route serializes through the PAGINATED schema, not the
    // resource schema. `paginated` is therefore meaningful on its own, and
    // was previously read only alongside `output` — so declaring it by
    // itself was accepted and dropped.
    if (cfg.paginated !== undefined) {
      if (op !== Operation.List) {
        throw new Error(
          `defineResource(${resourceKey}): \`operations.${label}.paginated\` is only ` +
            `meaningful on \`list\` — no other operation serializes a collection.`,
        );
      }
      const paginatedContext = `defineResource(${resourceKey}): operations.${label}.paginated`;
      assertNamedSchema(cfg.paginated, paginatedContext);
      assertFailClosedResponse(cfg.paginated, paginatedContext);
      assertNoHiddenFields(cfg.paginated, paginatedContext);
      next.response = { ...(next.response ?? {}), paginated: cfg.paginated };
    }
    if (cfg.output !== undefined) {
      const context = `defineResource(${resourceKey}): operations.${label}.output`;
      assertNamedSchema(cfg.output, context);
      assertFailClosedResponse(cfg.output, context);
      assertNoHiddenFields(cfg.output, context);
      next.response = {
        ...(next.response ?? {}),
        resource: cfg.output,
        // Derive the envelope from the override unless the caller supplied
        // their own, otherwise a `list` override would be ignored on the
        // wire and in the OpenAPI document.
        ...(cfg.paginated === undefined && op === Operation.List
          ? { paginated: buildPaginatedSchema(cfg.output, context) }
          : {}),
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
