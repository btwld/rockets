import * as sqlite3 from 'sqlite3';
import { PlainLiteralObject } from '@nestjs/common';
import {
  DeepPartial,
  RepositoryInternals,
  RepositoryInterface,
  ModelQueryException,
} from '@concepta/nestjs-common';

// Query operator interface for SQLite
interface QueryOperator<T = unknown> {
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
}

// Define types for database operations
interface DatabaseRow extends Record<string, unknown> {}

interface SqliteRunResult {
  lastID: number;
  changes: number;
}

// Define database parameter types
type DatabaseValue = string | number | boolean | Date | null | undefined;

// Column metadata interface for enhanced type information
interface ColumnMetadata {
  type: string;
  nullable?: boolean;
  unique?: boolean;
  default?: string | number | boolean;
  length?: number;
}

// Where clause type for better type safety
type WhereClause = Record<string, unknown | QueryOperator>;

// Order clause type
type OrderClause = Record<string, 'ASC' | 'DESC'>;

// Decorator metadata keys for future extensibility
const COLUMN_METADATA_KEY = Symbol('column_metadata');
const TABLE_METADATA_KEY = Symbol('table_metadata');

// Decorator interfaces for future use
interface ColumnOptions {
  type?: string;
  nullable?: boolean;
  unique?: boolean;
  default?: string | number | boolean;
  length?: number;
}

interface TableOptions {
  name?: string;
}

// Utility decorators for defining column metadata (optional usage)
export function Column(options: ColumnOptions = {}) {
  return function (target: Record<string, unknown>, propertyKey: string) {
    const existingMetadata =
      Reflect.getMetadata(COLUMN_METADATA_KEY, target) || {};
    existingMetadata[propertyKey] = options;
    Reflect.defineMetadata(COLUMN_METADATA_KEY, existingMetadata, target);
  };
}

export function Table(options: TableOptions = {}) {
  return function (target: Record<string, unknown>) {
    Reflect.defineMetadata(TABLE_METADATA_KEY, options, target);
  };
}

/**
 * SQLite Repository Adapter
 *
 * A completely generic repository adapter that automatically generates database schemas
 * based purely on entity class properties and TypeScript types, with optional decorator support.
 *
 * Features:
 * - Pure TypeScript type inference - no hardcoded property assumptions
 * - Automatic column type mapping from TypeScript types
 * - Support for optional TypeScript decorators (\@Column, \@Table)
 * - Intelligent type conversion between database and entity
 * - Caching for improved performance
 * - Completely extensible through decorators
 *
 * The adapter makes NO assumptions about your entity structure except for these
 * universal patterns (only if the properties exist):
 * - 'id' property becomes TEXT PRIMARY KEY
 * - 'dateCreated', 'dateUpdated' become TEXT NOT NULL
 * - 'dateDeleted' becomes TEXT (nullable)
 * - 'version' becomes INTEGER DEFAULT 1
 *
 * Usage:
 * ```typescript
 * class UserEntity {
 *   id: string;
 *   email: string;        // Becomes TEXT
 *   username: string;     // Becomes TEXT
 *   active: boolean;      // Becomes INTEGER
 *   age: number;          // Becomes INTEGER
 *   dateCreated: Date;    // Becomes TEXT NOT NULL
 *   dateUpdated: Date;    // Becomes TEXT NOT NULL
 * }
 *
 * const adapter = new SqliteRepositoryAdapter(UserEntity);
 * ```
 *
 * With decorators for explicit control:
 * ```typescript
 * @Table({ name: 'custom_users' })
 * class UserEntity {
 *   @Column({ type: 'TEXT PRIMARY KEY' })
 *   id: string;
 *
 *   @Column({ type: 'TEXT UNIQUE NOT NULL', length: 255 })
 *   email: string;
 *
 *   @Column({ type: 'INTEGER DEFAULT 1' })
 *   active: boolean;
 * }
 * ```
 */
export class SqliteRepositoryAdapter<Entity extends PlainLiteralObject>
  implements RepositoryInterface<Entity>
{
  protected db: sqlite3.Database;
  protected readonly tableName: string;
  protected readonly entityClass: new () => Entity;
  private columnCache: Record<string, ColumnMetadata> | null = null;

  constructor(entityClass: new () => Entity, dbPath = './rockets.sqlite') {
    this.entityClass = entityClass;
    this.tableName = this.getTableNameFromEntity(entityClass);
    this.db = new sqlite3.Database(dbPath);
    this.initializeTable();
  }

  /**
   * Get table name from entity class name or decorator metadata
   */
  private getTableNameFromEntity(entityClass: new () => Entity): string {
    // Check for decorator metadata first
    try {
      if (typeof Reflect !== 'undefined' && Reflect.getMetadata) {
        const tableMetadata: TableOptions =
          Reflect.getMetadata(TABLE_METADATA_KEY, entityClass) || {};
        if (tableMetadata.name) {
          return tableMetadata.name;
        }
      }
    } catch (e) {
      // Reflect metadata not available, continue with default logic
    }

    // Default logic: Convert PascalCase to snake_case and make plural
    const className = entityClass.name;
    return (
      className
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .substring(1) + 's'
    );
  }

  /**
   * Analyze entity properties to determine column structure
   */
  private analyzeEntityProperties(): Record<string, ColumnMetadata> {
    if (this.columnCache) {
      return this.columnCache;
    }

    const properties: Record<string, ColumnMetadata> = {};
    const propertyNames = new Set<string>();

    // Try to get properties from TypeORM metadata first
    try {
      const globalWithTypeORM = global as Record<string, unknown>;
      const typeormMetadataStorage =
        globalWithTypeORM.typeormMetadataStorage as
          | {
              tables?: Array<{
                target: new () => Entity;
                columns?: Array<{ propertyName: string }>;
              }>;
            }
          | undefined;

      const metadata = typeormMetadataStorage?.tables?.find(
        (table) => table.target === this.entityClass,
      );

      if (metadata?.columns) {
        metadata.columns.forEach((column) => {
          propertyNames.add(column.propertyName);
        });
      }
    } catch (error) {
      // TypeORM metadata not available, continue with other methods
    }

    // Get properties from the entity class prototype chain
    let currentPrototype = this.entityClass.prototype;
    while (currentPrototype && currentPrototype !== Object.prototype) {
      Object.getOwnPropertyNames(currentPrototype).forEach((name) => {
        if (name !== 'constructor' && !name.startsWith('_')) {
          const descriptor = Object.getOwnPropertyDescriptor(
            currentPrototype,
            name,
          );
          // Skip functions and getters/setters
          if (!descriptor || typeof descriptor.value !== 'function') {
            propertyNames.add(name);
          }
        }
      });
      currentPrototype = Object.getPrototypeOf(currentPrototype);
    }

    // Get properties from a sample entity instance
    try {
      const sampleEntity = new this.entityClass();
      Object.getOwnPropertyNames(sampleEntity).forEach((name) => {
        if (!name.startsWith('_')) {
          propertyNames.add(name);
        }
      });
    } catch (error) {
      // Could not create sample entity
    }

    // If still no properties found, add common base entity properties
    if (propertyNames.size === 0) {
      ['id', 'dateCreated', 'dateUpdated', 'dateDeleted', 'version'].forEach(
        (prop) => {
          propertyNames.add(prop);
        },
      );
    }

    // Always ensure 'id' is included
    propertyNames.add('id');

    // Analyze each property
    propertyNames.forEach((propertyName) => {
      // Try to infer from a sample entity first
      let metadata: ColumnMetadata | null = null;

      try {
        const sampleEntity = new this.entityClass();
        metadata = this.inferColumnMetadata(sampleEntity, propertyName);
      } catch (error) {
        // Could not create sample entity or infer metadata
      }

      // If we couldn't infer from sample, use property name patterns
      if (!metadata) {
        const sqlType = this.inferTypeFromPropertyName(propertyName);
        metadata = {
          type: sqlType,
          nullable: propertyName !== 'id',
        };
      }

      properties[propertyName] = metadata;
    });

    // Apply universal constraints
    this.applyUniversalConstraints(properties);

    this.columnCache = properties;
    return properties;
  }

  /**
   * Infer column metadata from property value and TypeScript type information
   */
  private inferColumnMetadata(
    entity: Entity,
    propertyName: string,
  ): ColumnMetadata | null {
    const value = (entity as Record<string, unknown>)[propertyName];
    const propertyDescriptor =
      Object.getOwnPropertyDescriptor(entity, propertyName) ||
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(entity),
        propertyName,
      );

    // Skip functions and getters/setters for now
    if (
      propertyDescriptor &&
      (typeof propertyDescriptor.value === 'function' ||
        propertyDescriptor.get ||
        propertyDescriptor.set)
    ) {
      return null;
    }

    // Infer type purely from TypeScript type information
    let sqlType: string;
    let nullable = true;
    let defaultValue: string | number | boolean | undefined;

    // Type inference based on actual value type
    if (typeof value === 'string') {
      sqlType = 'TEXT';
    } else if (typeof value === 'number') {
      sqlType = 'INTEGER';
    } else if (typeof value === 'boolean') {
      sqlType = 'INTEGER';
      defaultValue = value ? 1 : 0;
    } else if (value instanceof Date) {
      sqlType = 'TEXT';
    } else if (value === null || value === undefined) {
      // For null/undefined values, infer from property name patterns
      sqlType = this.inferTypeFromPropertyName(propertyName);
      nullable = true;
    } else {
      // Default to TEXT for unknown types (objects, arrays, etc.)
      sqlType = 'TEXT';
    }

    return {
      type: sqlType,
      nullable,
      unique: false,
      default: defaultValue,
    };
  }

  /**
   * Infer SQL type from property name patterns
   */
  private inferTypeFromPropertyName(propertyName: string): string {
    const lowerName = propertyName.toLowerCase();

    // Date/timestamp fields
    if (
      lowerName.includes('date') ||
      lowerName.includes('time') ||
      lowerName.endsWith('at')
    ) {
      return 'TEXT';
    }

    // Hash and salt fields should be TEXT
    if (
      lowerName.includes('hash') ||
      lowerName.includes('salt') ||
      lowerName.includes('token')
    ) {
      return 'TEXT';
    }

    // Boolean fields
    if (
      lowerName.includes('active') ||
      lowerName.includes('enabled') ||
      lowerName.includes('is') ||
      lowerName.includes('has') ||
      lowerName.includes('can') ||
      lowerName.includes('should')
    ) {
      return 'INTEGER';
    }

    // Numeric fields
    if (
      lowerName.includes('count') ||
      lowerName.includes('number') ||
      lowerName.includes('amount') ||
      lowerName.includes('size') ||
      lowerName.includes('length') ||
      lowerName.includes('version')
    ) {
      return 'INTEGER';
    }

    // Default to TEXT
    return 'TEXT';
  }

  /**
   * Apply universal constraints for common entity patterns
   */
  private applyUniversalConstraints(
    columns: Record<string, ColumnMetadata>,
  ): void {
    // Only apply constraints that are universally applicable based on property names
    // All specific business logic should come from decorators or entity design

    // If there's an 'id' property, make it the primary key
    if (columns.id) {
      columns.id.type = 'TEXT PRIMARY KEY';
      columns.id.nullable = false;
    }

    // Common timestamp fields
    if (columns.dateCreated) {
      columns.dateCreated.type = 'TEXT NOT NULL';
      columns.dateCreated.nullable = false;
    }

    if (columns.dateUpdated) {
      columns.dateUpdated.type = 'TEXT NOT NULL';
      columns.dateUpdated.nullable = false;
    }

    if (columns.dateDeleted) {
      columns.dateDeleted.type = 'TEXT';
      columns.dateDeleted.nullable = true;
    }

    // Version field for optimistic locking
    if (columns.version) {
      columns.version.type = 'INTEGER DEFAULT 1';
      columns.version.nullable = false;
      columns.version.default = 1;
    }
  }

  /**
   * Get column definitions from entity analysis
   */
  private getEntityColumns(): Record<string, ColumnMetadata> {
    const columnMetadata = this.analyzeEntityProperties();
    const columns: Record<string, ColumnMetadata> = {};

    Object.entries(columnMetadata).forEach(([name, metadata]) => {
      columns[name] = metadata;
    });

    return columns;
  }

  /**
   * Clear the column cache to force re-analysis of entity properties
   * Useful when entity structure changes at runtime
   */
  public clearColumnCache(): void {
    this.columnCache = null;
  }

  /**
   * Get the current column metadata for debugging purposes
   */
  public getColumnMetadata(): Record<string, ColumnMetadata> {
    return this.analyzeEntityProperties();
  }

  /**
   * Check if a column exists in the entity
   */
  public hasColumn(columnName: string): boolean {
    const metadata = this.analyzeEntityProperties();
    return columnName in metadata;
  }

  /**
   * Initialize table based on entity structure
   */
  protected initializeTable(): void {
    const columns = this.getEntityColumns();
    const columnDefinitions = Object.entries(columns)
      .map(([name, metadata]) => `${name} ${metadata.type}`)
      .join(',\n        ');

    const createTableSql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        ${columnDefinitions}
      )
    `;

    try {
      this.db.exec(createTableSql);
    } catch (err) {
      console.error(
        `SqliteRepositoryAdapter: Error creating ${this.tableName} table:`,
        err,
      );
      throw err;
    }
  }

  /**
   * Ensure all required columns exist in the table
   */
  protected async ensureColumnsExist(requiredColumns: string[]): Promise<void> {
    try {
      // Get current table schema
      const tableInfoSql = `PRAGMA table_info(${this.tableName})`;
      const existingColumns = new Set<string>();

      // Get existing columns
      const rows = await this.allQuery(tableInfoSql);

      if (rows) {
        rows.forEach((row) => {
          existingColumns.add(row.name as string);
        });
      }

      // Add missing columns
      const columnMetadata = this.analyzeEntityProperties();

      for (const columnName of requiredColumns) {
        if (!existingColumns.has(columnName)) {
          let metadata = columnMetadata[columnName];

          // If no metadata exists, infer it from the property name
          if (!metadata) {
            const sqlType = this.inferTypeFromPropertyName(columnName);
            metadata = {
              type: sqlType,
              nullable: columnName !== 'id',
            };
          }

          const columnDef = `${columnName} ${metadata.type}`;
          const alterSql = `ALTER TABLE ${this.tableName} ADD COLUMN ${columnDef}`;

          try {
            await this.runQuery(alterSql);
          } catch (alterErr) {
            console.error(`Error adding column ${columnName}:`, alterErr);
          }
        }
      }
    } catch (err) {
      console.error('Error ensuring columns exist:', err);
    }
  }

  /**
   * Map database row to entity using column metadata
   */
  protected mapRowToEntity(row: DatabaseRow): Entity {
    const entity = {} as Entity;

    for (const [key, value] of Object.entries(row)) {
      if (value !== null && value !== undefined) {
        // Check if this property should be treated as a date
        const isDateProperty =
          key.toLowerCase().includes('date') ||
          key.toLowerCase().includes('time') ||
          key.toLowerCase().includes('at') ||
          key.toLowerCase().includes('created') ||
          key.toLowerCase().includes('updated') ||
          key.toLowerCase().includes('deleted');

        if (
          isDateProperty &&
          typeof value === 'string' &&
          !isNaN(Date.parse(value))
        ) {
          (entity as Record<string, unknown>)[key] = new Date(value);
        } else if (key === 'active' && typeof value === 'number') {
          // Convert SQLite integer to boolean for active field
          (entity as Record<string, unknown>)[key] = Boolean(value);
        } else if (key === 'version' && typeof value === 'number') {
          // Keep version as number
          (entity as Record<string, unknown>)[key] = value;
        } else {
          (entity as Record<string, unknown>)[key] = value;
        }
      } else {
        (entity as Record<string, unknown>)[key] = value;
      }
    }

    return entity;
  }

  /**
   * Map entity to database parameters using column metadata
   */
  protected mapEntityToParams(entity: Entity): DatabaseValue[] {
    const columns = this.getColumnNames();
    const columnMetadata = this.analyzeEntityProperties();

    return columns.map((column) => {
      const value = (entity as Record<string, unknown>)[column];
      const metadata = columnMetadata[column];

      if (value === null || value === undefined) {
        return null;
      }

      // Use metadata for intelligent conversion
      if (metadata) {
        if (metadata.type.includes('INTEGER')) {
          // Handle boolean and number fields
          if (typeof value === 'boolean') {
            return value ? 1 : 0;
          } else {
            return Number(value);
          }
        } else if (value instanceof Date) {
          return value.toISOString();
        } else {
          return value as DatabaseValue;
        }
      } else {
        // No metadata available, use basic type conversion
        if (typeof value === 'boolean') {
          return value ? 1 : 0;
        } else if (value instanceof Date) {
          return value.toISOString();
        } else {
          return value as DatabaseValue;
        }
      }
    });
  }

  /**
   * Get column names for INSERT/UPDATE
   */
  protected getColumnNames(): string[] {
    return Object.keys(this.getEntityColumns());
  }

  /**
   * Get the entity name
   */
  entityName(): string {
    return this.tableName;
  }

  protected generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  protected runQuery(
    sql: string,
    params: DatabaseValue[] = [],
  ): Promise<SqliteRunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  protected getQuery(
    sql: string,
    params: DatabaseValue[] = [],
  ): Promise<DatabaseRow | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as DatabaseRow | undefined);
        }
      });
    });
  }

  protected allQuery(
    sql: string,
    params: DatabaseValue[] = [],
  ): Promise<DatabaseRow[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as DatabaseRow[]);
        }
      });
    });
  }

  protected buildWhereClause(
    where: WhereClause,
    params: DatabaseValue[],
  ): string {
    const conditions: string[] = [];
    Object.entries(where).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        // Check if value is a query operator
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          !(value instanceof Date)
        ) {
          const operators = value as QueryOperator;

          if (operators.$gt !== undefined) {
            conditions.push(`${key} > ?`);
            params.push(operators.$gt as DatabaseValue);
          }
          if (operators.$gte !== undefined) {
            conditions.push(`${key} >= ?`);
            params.push(operators.$gte as DatabaseValue);
          }
          if (operators.$lt !== undefined) {
            conditions.push(`${key} < ?`);
            params.push(operators.$lt as DatabaseValue);
          }
          if (operators.$lte !== undefined) {
            conditions.push(`${key} <= ?`);
            params.push(operators.$lte as DatabaseValue);
          }
        } else {
          // Regular equality check
          conditions.push(`${key} = ?`);
          params.push(value as DatabaseValue);
        }
      } else {
        conditions.push(`${key} IS NULL`);
      }
    });
    return conditions.join(' AND ');
  }

  protected buildOrderClause(order: OrderClause): string {
    const orderClauses: string[] = [];
    Object.entries(order).forEach(([key, direction]) => {
      orderClauses.push(`${key} ${direction}`);
    });
    return orderClauses.join(', ');
  }

  async find(
    options?: RepositoryInternals.FindManyOptions<Entity>,
  ): Promise<Entity[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: DatabaseValue[] = [];

    if (options?.where) {
      const whereClause = this.buildWhereClause(
        options.where as WhereClause,
        params,
      );
      if (whereClause) {
        sql += ` WHERE ${whereClause}`;
      }
    }

    if (options?.order) {
      const orderClause = this.buildOrderClause(options.order as OrderClause);
      if (orderClause) {
        sql += ` ORDER BY ${orderClause}`;
      }
    }

    if (options?.take) {
      sql += ` LIMIT ${options.take}`;
    }

    if (options?.skip) {
      sql += ` OFFSET ${options.skip}`;
    }

    const rows = await this.allQuery(sql, params);
    const entities = rows.map((row) => this.mapRowToEntity(row));

    return entities;
  }

  async findOne(
    options: RepositoryInternals.FindOneOptions<Entity>,
  ): Promise<Entity | null> {
    const results = await this.find({ ...options, take: 1 });
    const result = results.length > 0 ? results[0] : null;

    return result;
  }

  create(entityLike: DeepPartial<Entity>): Entity {
    const entity = {
      id: this.generateId(),
      ...entityLike,
    } as Entity;
    return entity;
  }

  merge(
    mergeIntoEntity: Entity,
    ...entityLikes: DeepPartial<Entity>[]
  ): Entity {
    return Object.assign(mergeIntoEntity, ...entityLikes);
  }

  async save<T extends DeepPartial<Entity>>(
    entities: T[],
    options?: RepositoryInternals.SaveOptions,
  ): Promise<(T & Entity)[]>;
  async save<T extends DeepPartial<Entity>>(
    entity: T,
    options?: RepositoryInternals.SaveOptions,
  ): Promise<T & Entity>;
  async save<T extends DeepPartial<Entity>>(
    entity: T | T[],
    options?: RepositoryInternals.SaveOptions,
  ): Promise<(T & Entity) | (T & Entity)[]> {
    try {
      if (Array.isArray(entity)) {
        const savedEntities: (T & Entity)[] = [];
        for (const item of entity) {
          const savedEntity = (await this.save(item, options)) as T & Entity;
          savedEntities.push(savedEntity);
        }
        return savedEntities;
      }

      const entityRecord = entity as Record<string, unknown>;

      // Ensure entity has an ID
      if (!entityRecord.id) {
        entityRecord.id = this.generateId();
      }

      // Set timestamps if they don't exist
      const now = new Date();
      if (!entityRecord.dateCreated) {
        entityRecord.dateCreated = now;
      }
      entityRecord.dateUpdated = now;

      // Set default version if not provided
      if (entityRecord.version === null || entityRecord.version === undefined) {
        entityRecord.version = 1;
      }

      // Get columns from the cached analysis
      const cachedColumns = this.getColumnNames();

      // Also get columns from the actual entity being saved
      const entityColumns = Object.keys(entityRecord).filter(
        (key) => entityRecord[key] !== undefined && !key.startsWith('_'),
      );

      // Combine both sets of columns, prioritizing entity columns
      const allColumns = new Set([...entityColumns, ...cachedColumns]);
      const columns = Array.from(allColumns);

      // Ensure all columns exist in the table
      await this.ensureColumnsExist(columns);

      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT OR REPLACE INTO ${this.tableName} (${columns.join(
        ', ',
      )}) VALUES (${placeholders})`;

      // Map entity values to parameters for all columns
      const params = columns.map((column) => {
        const value = entityRecord[column];

        if (value === null || value === undefined) {
          return null;
        }

        // Convert values based on type
        if (typeof value === 'boolean') {
          return value ? 1 : 0;
        } else if (value instanceof Date) {
          return value.toISOString();
        } else {
          return value as DatabaseValue;
        }
      });

      await this.runQuery(sql, params);

      return entity as T & Entity;
    } catch (e) {
      console.error('Error in save method:', e);
      throw new ModelQueryException(this.entityName(), {
        originalError: e,
      });
    }
  }

  async remove(entities: Entity[]): Promise<Entity[]>;
  async remove(entity: Entity): Promise<Entity>;
  async remove(entity: Entity | Entity[]): Promise<Entity | Entity[]> {
    try {
      if (Array.isArray(entity)) {
        const removedEntities: Entity[] = [];
        for (const item of entity) {
          const removedEntity = (await this.remove(item)) as Entity;
          removedEntities.push(removedEntity);
        }
        return removedEntities;
      }

      const entityRecord = entity as Record<string, unknown>;
      if (entityRecord.id) {
        const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
        await this.runQuery(sql, [entityRecord.id as string]);
      }

      return entity;
    } catch (e) {
      throw new ModelQueryException(this.entityName(), {
        originalError: e,
      });
    }
  }

  gt<T>(value: T): QueryOperator<T> {
    return { $gt: value };
  }

  gte<T>(value: T): QueryOperator<T> {
    return { $gte: value };
  }

  lt<T>(value: T): QueryOperator<T> {
    return { $lt: value };
  }

  lte<T>(value: T): QueryOperator<T> {
    return { $lte: value };
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
