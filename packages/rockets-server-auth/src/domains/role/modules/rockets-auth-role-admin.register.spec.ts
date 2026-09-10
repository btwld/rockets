import {
  CrudModule,
  type CrudAdapter,
  type CrudCommandInterface,
  type CrudQueryInterface,
  type CrudResponsePaginatedInterface,
} from '@concepta/nestjs-crud';
import { Operation } from '@concepta/nestjs-core';
import { withOpenApi } from '@concepta/rockets-core';
import { f } from '@concepta/rockets-core/zod';
import { z } from 'zod';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { RocketsAuthRoleAdminModule } from './rockets-auth-role-admin.module';
import { rocketsAuthRoleSchema } from '../infrastructure/schemas/rockets-auth-role.schema';
import type { RocketsAuthRoleEntityInterface } from '../interfaces/rockets-auth-role-entity.interface';

/** Registration-only doubles: shaped like the CRUD handler contracts, never executed. */
class QueryHandlerDouble {
  readonly crudAdapter = {} as CrudAdapter<RocketsAuthRoleEntityInterface>;
  async execute(
    _query: CrudQueryInterface<RocketsAuthRoleEntityInterface>,
  ): Promise<CrudResponsePaginatedInterface<RocketsAuthRoleEntityInterface>> {
    throw new Error('not executed');
  }
}
class CommandHandlerDouble {
  readonly crudAdapter = {} as CrudAdapter<RocketsAuthRoleEntityInterface>;
  async execute(
    _command: CrudCommandInterface<RocketsAuthRoleEntityInterface>,
  ): Promise<RocketsAuthRoleEntityInterface | null> {
    return null;
  }
}
class ListHandler extends QueryHandlerDouble {}
class ReadHandler extends QueryHandlerDouble {}
class CreateHandler extends CommandHandlerDouble {}
class UpdateHandler extends CommandHandlerDouble {}
class DeleteHandler extends CommandHandlerDouble {}

afterEach(() => vi.restoreAllMocks());

describe('RocketsAuthRoleAdminModule.register', () => {
  // A consumer-supplied `roleCrud.model` reaches upstream CRUD serialization
  // directly: a hidden field inside it would ship on `/admin/roles`.
  it('rejects an OPEN model (catchall)', () => {
    const openModel = withOpenApi(
      rocketsAuthRoleSchema.catchall(z.unknown()),
      'OpenRoleDto',
    );
    expect(() =>
      RocketsAuthRoleAdminModule.register({ imports: [], model: openModel }),
    ).toThrow(/is open at/);
  });

  it('rejects a model that contains a dto.response=false field', () => {
    const leaky = withOpenApi(
      rocketsAuthRoleSchema.extend({
        secret: f.string({ dto: { response: false } }),
      }),
      'LeakyRoleDto',
    );
    expect(() =>
      RocketsAuthRoleAdminModule.register({ imports: [], model: leaky }),
    ).toThrow(/hand-written response schema contains a field/);
  });

  it('builds CrudModule feature with paginated admin DTO', () => {
    const dynamic = RocketsAuthRoleAdminModule.register({
      imports: [],
      model: rocketsAuthRoleSchema,
    });
    expect(dynamic.module).toBe(RocketsAuthRoleAdminModule);
    expect(Array.isArray(dynamic.imports)).toBe(true);
    expect((dynamic.imports ?? []).length).toBeGreaterThan(0);
  });

  it('forwards every route handler override to CrudModule', () => {
    const forFeature = vi.spyOn(CrudModule, 'forFeature');

    RocketsAuthRoleAdminModule.register({
      imports: [],
      model: rocketsAuthRoleSchema,
      controller: {
        adminResource: {
          routes: {
            list: { handler: ListHandler },
            read: { handler: ReadHandler },
            create: { handler: CreateHandler },
            update: { handler: UpdateHandler },
            delete: { handler: DeleteHandler },
          },
        },
      },
    });

    expect(forFeature).toHaveBeenCalledOnce();
    const config = forFeature.mock.calls.at(-1)?.[0] as {
      crud: {
        operations: Array<{
          operation: Operation;
          queryHandler?: unknown;
          commandHandler?: unknown;
        }>;
      };
    };
    const operations = new Map(
      config.crud.operations.map((operation) => [
        operation.operation,
        operation,
      ]),
    );

    expect(operations.get(Operation.List)?.queryHandler).toBe(ListHandler);
    expect(operations.get(Operation.Read)?.queryHandler).toBe(ReadHandler);
    expect(operations.get(Operation.Create)?.commandHandler).toBe(
      CreateHandler,
    );
    expect(operations.get(Operation.Update)?.commandHandler).toBe(
      UpdateHandler,
    );
    expect(operations.get(Operation.Delete)?.commandHandler).toBe(
      DeleteHandler,
    );
  });
});
