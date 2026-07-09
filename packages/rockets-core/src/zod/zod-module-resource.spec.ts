import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import type { SchemaEntityCompiler } from '../common';
import { ResourceKind } from '../domain/interfaces/resource-kind.enum';
import { bindZodResources } from './zod-resource';
import { zodModuleResource } from './zod-module-resource';

describe('zodModuleResource', () => {
  class ClassicAuditEntity {
    id!: string;
  }

  const schema = z.object({
    id: z.string(),
    message: z.string(),
  });

  it('accepts zod schema-backed entities and classic entity classes together', () => {
    const compiled: Array<{ name: string; table: string }> = [];
    const compiler: SchemaEntityCompiler = {
      compileEntity: (_schema, options) => {
        compiled.push(options);
        class GeneratedEntity {}
        Object.defineProperty(GeneratedEntity, 'name', { value: options.name });
        return GeneratedEntity as Type<PlainLiteralObject>;
      },
    };

    const resource = zodModuleResource({
      entityCompiler: compiler,
      entities: [
        ClassicAuditEntity,
        {
          name: 'AuditLog',
          schema,
          table: 'audit_logs',
        },
      ],
    });

    expect(resource.kind).toBe(ResourceKind.Module);
    expect(compiled).toEqual([{ name: 'AuditLogEntity', table: 'audit_logs' }]);
    expect(resource.entities).toEqual([
      { key: 'classicAudit', entity: ClassicAuditEntity },
      { key: 'auditLog', entity: expect.any(Function) },
    ]);
    expect(resource.entities[1]?.entity.name).toBe('AuditLogEntity');
  });

  it('uses the bound compiler and preserves per-entity metadata', () => {
    const compiler: SchemaEntityCompiler = {
      compileEntity: (_schema, options) => {
        class GeneratedEntity {}
        Object.defineProperty(GeneratedEntity, 'name', { value: options.name });
        return GeneratedEntity as Type<PlainLiteralObject>;
      },
    };
    const { zodModuleResource: boundZodModuleResource } =
      bindZodResources(compiler);

    const resource = boundZodModuleResource({
      entities: [
        {
          key: 'audit',
          name: 'AuditLog',
          schema,
          collection: 'audit-log-events',
        },
      ],
    });

    expect(resource.entities).toEqual([
      {
        key: 'audit',
        entity: expect.any(Function),
        collection: 'audit-log-events',
      },
    ]);
  });
});
