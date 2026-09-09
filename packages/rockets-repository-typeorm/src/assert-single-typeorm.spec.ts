import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import * as nestTypeOrm from '@nestjs/typeorm';

import {
  assertSingleTypeOrmInstance,
  hasSingleTypeOrmInstance,
} from './assert-single-typeorm';

/**
 * `@nestjs/typeorm` 12 is ESM, and an ESM module namespace is not
 * configurable — `vi.spyOn(ns, 'getDataSourceToken')` throws. Mocking the
 * module gives the same seam: `getDataSourceToken` delegates to the real
 * export unless a test overrides `dataSourceTokenOverride`.
 */
vi.mock('@nestjs/typeorm', async (importOriginal) => {
  const actual = await importOriginal<typeof nestTypeOrm>();
  return {
    ...actual,
    getDataSourceToken: (
      ...args: Parameters<typeof actual.getDataSourceToken>
    ) => dataSourceTokenOverride ?? actual.getDataSourceToken(...args),
  };
});

let dataSourceTokenOverride: unknown;

afterEach(() => {
  dataSourceTokenOverride = undefined;
  vi.restoreAllMocks();
});

describe('hasSingleTypeOrmInstance', () => {
  it('is true when both resolve the same DataSource class', () => {
    expect(hasSingleTypeOrmInstance()).toBe(true);
  });

  it('is false when @nestjs/typeorm resolved a different copy', () => {
    // A second copy of `typeorm` yields a structurally identical but
    // distinct `DataSource` class — which is exactly what makes the DI
    // token stop matching.
    class DataSourceFromAnotherCopy {}
    dataSourceTokenOverride = DataSourceFromAnotherCopy;

    expect(hasSingleTypeOrmInstance()).toBe(false);
  });
});

describe('assertSingleTypeOrmInstance', () => {
  it('passes with a single copy', () => {
    expect(() => assertSingleTypeOrmInstance()).not.toThrow();
  });

  it('explains the cause and the fix on a mismatch', () => {
    class DataSourceFromAnotherCopy {}
    dataSourceTokenOverride = DataSourceFromAnotherCopy;

    expect(() => assertSingleTypeOrmInstance()).toThrow(
      /Two copies of `typeorm` are loaded/,
    );
    // The message has to say what to DO — the whole point is that Nest's
    // own error does not.
    expect(() => assertSingleTypeOrmInstance()).toThrow(/yarn why typeorm/);
    expect(() => assertSingleTypeOrmInstance()).toThrow(/DataSource element/);
  });

  it('uses the real DataSource class as the token by default', () => {
    // Pins the upstream behaviour the whole check rests on.
    expect(nestTypeOrm.getDataSourceToken()).toBe(DataSource);
  });
});

/**
 * `typeorm` must stay a peer dependency. As a hard `dependency` a package
 * manager is free to nest its own copy, which is the duplicate-instance
 * failure this module exists to diagnose.
 */
describe('typeorm dependency declaration', () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  it('declares typeorm as a peer dependency, not a hard one', () => {
    expect(manifest.peerDependencies?.typeorm).toBeDefined();
    expect(manifest.dependencies?.typeorm).toBeUndefined();
  });

  it('declares @nestjs/typeorm as a peer dependency, not a hard one', () => {
    expect(manifest.peerDependencies?.['@nestjs/typeorm']).toBeDefined();
    expect(manifest.dependencies?.['@nestjs/typeorm']).toBeUndefined();
  });
});
