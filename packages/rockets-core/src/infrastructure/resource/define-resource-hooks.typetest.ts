/**
 * Compile-only checks: `yarn test:typetests` / `tsc -p tsconfig.typetest.json`.
 * Excluded from the production `tsc` build via `tsconfig.json` exclude.
 */
import { Injectable } from '@nestjs/common';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EntityHook, PassthroughEntityHookBase } from '../hooks/entity-hook';
import type { RocketsEntityHookForResource } from '../hooks/entity-hook';
import { defineResource } from './define-resource';

@Entity('typetest_widgets')
class TypetestWidgetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;
}

@EntityHook()
@Injectable()
class ValidWidgetHook extends PassthroughEntityHookBase<TypetestWidgetEntity> {}

class NotAnEntityHook {}

void defineResource({
  key: 'typetestWidget',
  entity: TypetestWidgetEntity,
  path: 'typetest-widgets',
  tags: ['Typetest'],
  hooks: [ValidWidgetHook],
});

const _tokenAcceptsPassthrough: RocketsEntityHookForResource<TypetestWidgetEntity> =
  ValidWidgetHook;

void _tokenAcceptsPassthrough;

void defineResource({
  key: 'typetestWidget2',
  entity: TypetestWidgetEntity,
  path: 'typetest-widgets',
  tags: ['Typetest'],
  // @ts-expect-error — only EntityHookBase / PassthroughEntityHookBase subclasses are allowed
  hooks: [NotAnEntityHook],
});
