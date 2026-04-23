/**
 * Patch @concepta/nestjs-common to re-export symbols that were moved
 * to @concepta/nestjs-repository in v8.
 *
 * Some pre-compiled @concepta/nestjs-* packages (typeorm-ext, etc.)
 * still import these from @concepta/nestjs-common. This shim makes
 * them available at the old location so tests can load.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const common = require('@concepta/nestjs-common');
const repository = require('@concepta/nestjs-repository');

// Re-export functions that moved from common → repository
if (!common.getDynamicRepositoryToken) {
  common.getDynamicRepositoryToken = repository.getDynamicRepositoryToken;
}
if (!common.InjectDynamicRepository) {
  common.InjectDynamicRepository = repository.InjectDynamicRepository;
}
if (!common.RepositoryInterface) {
  common.RepositoryInterface = repository.RepositoryInterface;
}
if (!common.RepositoryInternals) {
  common.RepositoryInternals = repository.RepositoryInternals;
}

// ModelService was removed from the public API in v8 — provide a
// functional shim so v7 packages (nestjs-invitation, etc.) that
// extend it still work at runtime.
if (!common.ModelService) {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const { Where } = repository;

  common.ModelService = class ModelService {
    repo: Record<string, unknown>;
    createDto: unknown;
    updateDto: unknown;

    constructor(repo: Record<string, unknown>) {
      this.repo = repo;
    }

    async find(options: Record<string, unknown>) {
      return (
        this.repo as {
          find: (o: Record<string, unknown>) => Promise<unknown[]>;
        }
      ).find(options);
    }

    async byId(id: string) {
      return (
        this.repo as {
          findOne: (o: Record<string, unknown>) => Promise<unknown>;
        }
      ).findOne({
        where: Where.eq('id', id),
      });
    }

    async create(data: Record<string, unknown>) {
      const dto = await this.validate(this.createDto, data);
      const transformed = await this.transform(dto);
      const repo = this.repo as Record<string, (...args: unknown[]) => unknown>;
      // transform creates an in-memory entity from the DTO
      const entity = repo.transform ? repo.transform(transformed) : transformed;
      // v7 adapters: create() is sync (in-memory), must follow with save()
      // v8 adapters: create() is async and persists
      if (repo.save) {
        const created = repo.create ? repo.create(entity) : entity;
        return repo.save(created);
      }
      return repo.create(entity);
    }

    async update(data: Record<string, unknown> & { id: string }) {
      const entity = await this.findByIdOrFail(data.id);
      const dto = await this.validate(this.updateDto, data);
      const transformed = await this.transform(dto);
      return (
        this.repo as { update: (e: unknown, d: unknown) => Promise<unknown> }
      ).update(entity, transformed);
    }

    async replace(data: Record<string, unknown> & { id: string }) {
      const entity = await this.findByIdOrFail(data.id);
      const dto = await this.validate(this.createDto, data);
      const transformed = await this.transform(dto);
      return (
        this.repo as { replace: (e: unknown, d: unknown) => Promise<unknown> }
      ).replace(entity, transformed);
    }

    async remove(data: { id: string }) {
      const entity = await this.findByIdOrFail(data.id);
      return (this.repo as { delete: (e: unknown) => Promise<unknown> }).delete(
        entity,
      );
    }

    async validate(type: unknown, data: unknown) {
      if (!type) return data;
      const dto = plainToInstance(type, data);
      const errors = await validate(dto);
      if (errors?.length) {
        const err = new Error(`Validation failed: ${JSON.stringify(errors)}`);
        (err as unknown as Record<string, unknown>).validationErrors = errors;
        throw err;
      }
      return dto;
    }

    async transform(data: unknown) {
      return data;
    }

    async findByIdOrFail(id: string) {
      const entity = await this.byId(id);
      if (!entity) throw new Error(`Entity not found with id: ${id}`);
      return entity;
    }
  };
}

/**
 * Patch TypeOrmRepositoryAdapter to forward TypeORM metadata.
 *
 * CrudAdapter.initColumnMetadata() reads `repository.metadata.columns`
 * but TypeOrmRepositoryAdapter doesn't expose the underlying TypeORM
 * repository's metadata. Add a getter that forwards it.
 */
try {
  const typeormExt = require('@concepta/nestjs-typeorm-ext/dist/repository/typeorm-repository.adapter');
  const AdapterClass = typeormExt.TypeOrmRepositoryAdapter;
  if (
    AdapterClass &&
    !Object.getOwnPropertyDescriptor(AdapterClass.prototype, 'metadata')
  ) {
    Object.defineProperty(AdapterClass.prototype, 'metadata', {
      get() {
        return this.repo?.metadata;
      },
      configurable: true,
    });
  }
  // Add missing methods required by v8 RepositoryInterface
  if (AdapterClass) {
    if (!AdapterClass.prototype.prepare) {
      AdapterClass.prototype.prepare = function prepare(
        dto: Record<string, unknown>,
      ): Record<string, unknown> | undefined {
        if (!dto || !Object.keys(dto).length) return undefined;
        return this.repo.create(dto);
      };
    }
    if (!AdapterClass.prototype.upsert) {
      AdapterClass.prototype.upsert = async function upsert(
        entity: Record<string, unknown>,
        _options?: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        const repo = this.repo;
        const existing = entity.id
          ? await repo.findOne({ where: { id: entity.id } })
          : null;
        if (existing) {
          Object.assign(existing, entity);
          return repo.save(existing);
        }
        const created = repo.create(entity);
        return repo.save(created);
      };
    }

    /**
     * Translate v8 Where clause objects to TypeORM-compatible where objects.
     *
     * v8 RepositoryInterface uses Where.eq('field', value) which produces
     * { field: 'name', operator: 'eq', value: 'x' }.
     * TypeORM expects { name: 'x' }. Wrap findOne/find to translate.
     */
    function translateWhere(where: unknown): Record<string, unknown> | unknown {
      if (!where || typeof where !== 'object') return where;

      const w = where as Record<string, unknown>;

      // Single condition: { field, operator: 'eq', value }
      if ('field' in w && 'operator' in w && 'value' in w) {
        return { [w.field as string]: w.value };
      }

      // Compound AND: { operator: 'and', conditions: [...] }
      if (w.operator === 'and' && Array.isArray(w.conditions)) {
        const merged: Record<string, unknown> = {};
        for (const cond of w.conditions) {
          const translated = translateWhere(cond);
          if (translated && typeof translated === 'object') {
            Object.assign(merged, translated);
          }
        }
        return merged;
      }

      return where;
    }

    const origFindOne = AdapterClass.prototype.findOne;
    AdapterClass.prototype.findOne = async function findOnePatched(
      options: Record<string, unknown>,
    ) {
      if (options && options.where) {
        options = { ...options, where: translateWhere(options.where) };
      }
      return origFindOne.call(this, options);
    };

    const origFind = AdapterClass.prototype.find;
    AdapterClass.prototype.find = async function findPatched(
      options?: Record<string, unknown>,
    ) {
      if (options && options.where) {
        options = { ...options, where: translateWhere(options.where) };
      }
      return origFind.call(this, options);
    };

    const origCount = AdapterClass.prototype.count;
    AdapterClass.prototype.count = async function countPatched(
      options?: Record<string, unknown>,
    ) {
      if (options && options.where) {
        options = { ...options, where: translateWhere(options.where) };
      }
      return origCount.call(this, options);
    };

    if (!AdapterClass.prototype.findAndCount) {
      AdapterClass.prototype.findAndCount = async function findAndCountImpl(
        options?: Record<string, unknown>,
      ): Promise<[unknown[], number]> {
        if (options && options.where) {
          options = { ...options, where: translateWhere(options.where) };
        }
        return this.repo.findAndCount(options);
      };
    } else {
      const origFindAndCount = AdapterClass.prototype.findAndCount;
      AdapterClass.prototype.findAndCount = async function findAndCountPatched(
        options?: Record<string, unknown>,
      ) {
        if (options && options.where) {
          options = { ...options, where: translateWhere(options.where) };
        }
        return origFindAndCount.call(this, options);
      };
    }

    // Add missing v8 RepositoryInterface methods
    if (!AdapterClass.prototype.delete) {
      AdapterClass.prototype.delete = async function deleteImpl(
        entity: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        return this.repo.remove(entity);
      };
    }
    if (!AdapterClass.prototype.deleteMany) {
      AdapterClass.prototype.deleteMany = async function deleteManyImpl(
        entities: Record<string, unknown>[],
      ): Promise<Record<string, unknown>[]> {
        return this.repo.remove(entities);
      };
    }
    if (!AdapterClass.prototype.softDelete) {
      AdapterClass.prototype.softDelete = async function softDeleteImpl(
        entity: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        return this.repo.softRemove(entity);
      };
    }
    if (!AdapterClass.prototype.restore) {
      AdapterClass.prototype.restore = async function restoreImpl(
        entity: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        return this.repo.recover(entity);
      };
    }
    if (!AdapterClass.prototype.transform) {
      AdapterClass.prototype.transform = function transformImpl(
        entityLike: Record<string, unknown>,
      ): Record<string, unknown> {
        return this.repo.create(entityLike);
      };
    }
    if (!AdapterClass.prototype.replace) {
      AdapterClass.prototype.replace = async function replaceImpl(
        entity: Record<string, unknown>,
        data: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        const merged = this.repo.merge(entity, data);
        return this.repo.save(merged);
      };
    }
    if (!AdapterClass.prototype.update) {
      AdapterClass.prototype.update = async function updateImpl(
        entity: Record<string, unknown>,
        data: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        const merged = this.repo.merge(entity, data);
        return this.repo.save(merged);
      };
    }
    if (!AdapterClass.prototype.createMany) {
      AdapterClass.prototype.createMany = async function createManyImpl(
        entities: Record<string, unknown>[],
      ): Promise<Record<string, unknown>[]> {
        const created = this.repo.create(entities);
        return this.repo.save(created);
      };
    }
  }
} catch {
  // Package may not be installed — skip
}
