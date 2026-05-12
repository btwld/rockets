import { isCrudResource } from './aggregate-resources';
import { defineResource } from './define-resource';
import { defineModuleResource } from './define-module-resource';
import { defineSubResource } from './define-sub-resource';
import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';

class WidgetEntity {
  id!: string;
}

describe('isCrudResource', () => {
  it('returns true for a defineResource() output', () => {
    const bundle = defineResource({
      key: 'widget',
      entity: WidgetEntity,
      path: 'widgets',
      tags: ['widgets'],
    });
    expect(isCrudResource(bundle)).toBe(true);
  });

  it('returns false for a defineModuleResource() output', () => {
    const bundle = defineModuleResource({});
    expect(isCrudResource(bundle)).toBe(false);
  });

  it('returns false for a defineSubResource() output', () => {
    const sub = defineSubResource({
      key: 'widgetPart',
      entity: WidgetEntity,
    });
    expect(isCrudResource(sub)).toBe(false);
  });

  it('returns false for a manual RocketsResourceConfig (no kind)', () => {
    const manual = {
      crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
    };
    expect(isCrudResource(manual)).toBe(false);
  });

  it('returns false for objects shaped like CrudResource but missing the kind discriminator', () => {
    const lookalike = {
      core: { crud: {} },
      persistence: { module: null, entity: null },
      meta: { key: 'x', entityClass: WidgetEntity, relations: [] },
    };
    expect(isCrudResource(lookalike)).toBe(false);
  });

  it('returns false for null / undefined / primitives', () => {
    expect(isCrudResource(null)).toBe(false);
    expect(isCrudResource(undefined)).toBe(false);
    expect(isCrudResource('crud')).toBe(false);
    expect(isCrudResource(42)).toBe(false);
    expect(isCrudResource([])).toBe(false);
  });

  it('returns false for an object whose `kind` is the wrong discriminator', () => {
    expect(isCrudResource({ kind: ResourceKind.Module })).toBe(false);
    expect(isCrudResource({ kind: ResourceKind.Sub })).toBe(false);
    expect(isCrudResource({ kind: 'something-else' })).toBe(false);
  });

  it('the defineResource() output carries the correct kind discriminator', () => {
    const bundle = defineResource({
      key: 'widget',
      entity: WidgetEntity,
      path: 'widgets',
      tags: ['widgets'],
    });
    expect(bundle.kind).toBe(ResourceKind.Crud);
  });
});
