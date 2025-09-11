import { DynamicModule, Module, Provider } from '@nestjs/common';
import { getDynamicRepositoryToken } from '@concepta/nestjs-common';
import { PlainLiteralObject } from '@nestjs/common';
import { SqliteRepositoryAdapter } from './sqlite-repository.adapter';

export interface SqliteAdapterEntityConfig<
  T extends PlainLiteralObject = PlainLiteralObject,
> {
  entity: new () => T;
}

export interface SqliteAdapterFeatureOptions {
  [entityName: string]: SqliteAdapterEntityConfig;
}

export interface SqliteAdapterModuleOptions {
  dbPath?: string;
}

// Store the database path globally for the module
let globalDbPath = './rockets.sqlite';

@Module({})
export class SqliteAdapterModule {
  /**
   * Configure the SQLite adapter module for root
   */
  static forRoot(options?: SqliteAdapterModuleOptions): DynamicModule {
    globalDbPath = options?.dbPath || './rockets.sqlite';

    return {
      module: SqliteAdapterModule,
      global: true,
    };
  }

  /**
   * Configure the SQLite adapter module for feature entities
   * Returns dynamic repository tokens for each entity
   */
  static forFeature(entityOptions: SqliteAdapterFeatureOptions): DynamicModule {
    const providers: Provider[] = [];
    const exports: (string | symbol)[] = [];

    Object.entries(entityOptions).forEach(([entityName, config]) => {
      // Get the dynamic repository token using the framework's function
      const repositoryToken = getDynamicRepositoryToken(entityName);

      // Create provider for the repository
      const repositoryProvider: Provider = {
        provide: repositoryToken,
        useFactory: () => {
          return new SqliteRepositoryAdapter(config.entity, globalDbPath);
        },
      };

      providers.push(repositoryProvider);
      exports.push(repositoryToken);
    });

    return {
      module: SqliteAdapterModule,
      providers,
      exports,
    };
  }
}
