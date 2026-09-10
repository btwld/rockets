import { describe, expect, it } from 'vitest';
import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CrudModule } from '@concepta/nestjs-crud';
import { RepositoryModule } from '@concepta/nestjs-repository';
import { SwaggerUiModule } from '@concepta/rockets-core';

import {
  createRocketsAuthExports,
  createRocketsAuthImports,
} from './rockets-auth.module-definition';

function moduleClassOf(entry: unknown): Type<unknown> | undefined {
  if (typeof entry === 'function') return entry as Type<unknown>;
  if (typeof entry === 'object' && entry !== null && 'module' in entry) {
    return (entry as DynamicModule).module;
  }
  return undefined;
}

/**
 * Stand-in for the single `RocketsAuthRateLimitModule` registration the
 * real definition receives — the assertion here is about which modules
 * are ABSENT, so any dynamic module satisfies the parameter.
 */
@Module({})
class StubRateLimitModule {}

const rateLimitModule: DynamicModule = { module: StubRateLimitModule };

describe('RocketsAuthModule composition', () => {
  it('registers none of the infrastructure RocketsCoreModule already owns', () => {
    const imports = (
      createRocketsAuthImports({ imports: [], rateLimitModule }) ?? []
    ).map(moduleClassOf);

    for (const owned of [
      CqrsModule,
      RepositoryModule,
      CrudModule,
      SwaggerUiModule,
    ]) {
      expect(imports).not.toContain(owned);
    }
  });

  it('does not re-export SwaggerUiModule (core exports the single registration)', () => {
    expect(createRocketsAuthExports({ exports: [] })).not.toContain(
      SwaggerUiModule,
    );
  });
});
