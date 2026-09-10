import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPublicApiReport,
  compareText,
  discoverEntryPoints,
  normalizeSignature,
} from './public-api-reports.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let cachedReport;

function checkedReport() {
  if (cachedReport !== undefined) return cachedReport;
  execFileSync(process.execPath, ['scripts/public-api-reports.mjs'], {
    cwd: repositoryRoot,
    stdio: 'pipe',
  });
  cachedReport = JSON.parse(
    readFileSync(
      join(repositoryRoot, 'api', 'public-api-reports.json'),
      'utf8',
    ),
  );
  return cachedReport;
}

function findExport(report, entryPoint, name) {
  return report.entryPoints[entryPoint].find((item) => item.name === name);
}

test('records whether each declaration is also a runtime export', () => {
  const report = checkedReport();

  assert.equal(
    findExport(report, '@concepta/rockets', 'RocketsModule').runtime,
    true,
  );
  assert.equal(
    findExport(report, '@concepta/rockets', 'AuthAdapterInterface').runtime,
    false,
  );
});

test('records same-package declarations reachable through public signatures', () => {
  const report = checkedReport();
  const supporting = report.supportingDeclarations?.['@concepta/rockets-auth'];

  assert.ok(Array.isArray(supporting));
  const rateLimitWindow = supporting.find(
    (item) => item.name === 'RocketsAuthRateLimitWindow',
  );

  assert.deepEqual(rateLimitWindow.referencedBy, [
    'RocketsAuthThrottlingOptions',
  ]);
  assert.match(rateLimitWindow.signature, /readonly limit: number/);
});

test('distinguishes a type-only class export from a runtime class export', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'rockets-api-report-'));
  const packageRoot = join(temporaryRoot, 'package');
  const distRoot = join(packageRoot, 'dist');

  try {
    mkdirSync(distRoot, { recursive: true });
    writeFileSync(
      join(distRoot, 'index.d.ts'),
      [
        "export { read, RuntimeClass } from './public.js';",
        "export type { TypeOnlyClass, Wrapper } from './public.js';",
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(distRoot, 'public.d.ts'),
      [
        'interface HiddenShape { readonly value: string; }',
        'export declare function read(): HiddenShape;',
        'export declare class RuntimeClass {}',
        'export declare class TypeOnlyClass {}',
        "export interface Wrapper { value: import('./hidden.js').HiddenValue; }",
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(distRoot, 'hidden.d.ts'),
      'export interface HiddenValue { readonly id: string; }\n',
    );
    writeFileSync(
      join(distRoot, 'index.cjs'),
      "exports.read = () => ({ value: 'ok' });\nexports.RuntimeClass = class RuntimeClass {};\n",
    );

    const report = buildPublicApiReport(
      [
        {
          entryPoint: '@fixture/package',
          packageRoot,
          typesPath: join(distRoot, 'index.d.ts'),
          runtimePath: join(distRoot, 'index.cjs'),
        },
      ],
      temporaryRoot,
    );
    const exports = report.entryPoints['@fixture/package'];

    assert.equal(
      exports.find(({ name }) => name === 'RuntimeClass').runtime,
      true,
    );
    assert.equal(
      exports.find(({ name }) => name === 'TypeOnlyClass').runtime,
      false,
    );
    assert.match(
      exports.find(({ name }) => name === 'Wrapper').signature,
      /value: HiddenValue/,
    );
    assert.deepEqual(
      report.supportingDeclarations['@fixture/package']
        .filter(({ name }) => name === 'HiddenShape')
        .flatMap(({ referencedBy }) => referencedBy),
      ['read'],
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects runtime exports that have no public declaration', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'rockets-api-report-'));
  const packageRoot = join(temporaryRoot, 'package');
  const distRoot = join(packageRoot, 'dist');

  try {
    mkdirSync(distRoot, { recursive: true });
    writeFileSync(
      join(distRoot, 'index.d.ts'),
      'export declare const declared = true;\n',
    );
    writeFileSync(
      join(distRoot, 'index.cjs'),
      'exports.declared = true;\nexports.default = true;\nexports.undeclared = true;\n',
    );

    assert.throws(
      () =>
        buildPublicApiReport(
          [
            {
              entryPoint: '@fixture/package',
              packageRoot,
              typesPath: join(distRoot, 'index.d.ts'),
              runtimePath: join(distRoot, 'index.cjs'),
            },
          ],
          temporaryRoot,
        ),
      /runtime exports without declarations: default, undeclared/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects an export subpath with no resolvable .d.ts types condition', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'rockets-api-report-'));
  const packageRoot = join(temporaryRoot, 'packages', 'fixture');

  try {
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@concepta/fixture',
        repository: { directory: 'packages/fixture' },
        exports: {
          '.': { types: './dist/index.d.ts', require: './dist/index.js' },
          './testing': './dist/testing/index.js',
        },
      }),
    );

    assert.throws(
      () => discoverEntryPoints(temporaryRoot),
      /@concepta\/fixture export "\.\/testing" has no resolvable \.d\.ts types condition/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('orders report keys by code unit rather than host locale', () => {
  // Under `cs-CZ` the "ch" digraph reverses the first pair, and under `da-DK`
  // the case-insensitive pass reverses the second. The committed report is
  // compared byte for byte, so ordering must not depend on the host locale.
  assert.ok(
    compareText(
      'AbstractChangeMyPasswordHandler',
      'AbstractGetUserMetadataHandler',
    ) < 0,
  );
  assert.ok(compareText('RocketsEntityMeta', 'rocketsEntityMeta') < 0);
  assert.equal(compareText('SwaggerUiModule', 'SwaggerUiModule'), 0);
});

test('normalizes internal declaration paths but preserves external package names', () => {
  assert.equal(
    normalizeSignature(
      'value: import("../../domains/user.js").User; nest: import("@nestjs/common").Type<User>;',
      repositoryRoot,
    ),
    'value: User; nest: import("@nestjs/common").Type<User>;',
  );
});
