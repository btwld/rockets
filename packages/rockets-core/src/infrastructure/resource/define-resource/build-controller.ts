import type { PlainLiteralObject } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UseHooks } from '@bitwild/rockets-app';
import type { JoinClause } from '@bitwild/rockets-repository';
import type { ResourceRelationEntry } from '../../../domain/interfaces/rockets-resource-definition.interface';
import type { RocketsEntityHookForResource } from '../../hooks/entity-hook';

type CrudDecorator = ReturnType<typeof applyDecorators>;

export function buildControllerDecorators<E extends PlainLiteralObject>(args: {
  tags: readonly string[];
  bearerAuth: boolean;
  hooks: readonly RocketsEntityHookForResource<E>[] | undefined;
  extra: readonly ClassDecorator[] | undefined;
}): CrudDecorator[] {
  const decorators: CrudDecorator[] = [];
  if (args.bearerAuth) decorators.push(applyDecorators(ApiBearerAuth()));
  decorators.push(applyDecorators(ApiTags(...args.tags)));
  if (args.hooks?.length) {
    decorators.push(applyDecorators(UseHooks(...args.hooks)));
  }
  if (args.extra?.length) {
    for (const d of args.extra) decorators.push(applyDecorators(d));
  }
  return decorators;
}

export function buildControllerJoins(
  relations: readonly ResourceRelationEntry[] | undefined,
): readonly JoinClause[] | undefined {
  if (!relations?.length) return undefined;
  const clauses = relations
    .filter((r) => r.include !== 'never')
    .map<JoinClause>((r) => ({ relation: r.propertyName }));
  return clauses.length ? clauses : undefined;
}
