#!/usr/bin/env node
/**
 * Runs each `*.e2e-spec.ts` file in its OWN Jest process.
 *
 * Why: these e2e suites each boot a full Nest + TypeORM app. Run together
 * in one Jest worker (`maxWorkers: 1`), they share process-level state that
 * Jest's per-file module sandbox does not reset — the native `sqlite3`
 * addon, TypeORM/Nest global metadata accumulated by decorators at import,
 * and the zod schema→entity registry. That cross-suite bleed made the full
 * run flaky (a suite that is green in isolation intermittently failed when
 * another app-booting suite ran before it in the same process).
 *
 * One process per file makes every suite hermetic — no shared globals, no
 * shared native handles — without skips, retries, or ordering tricks.
 *
 * Usage: node scripts/run-isolated-e2e.cjs <jest-config> [extra jest args]
 * (cwd must be the workspace whose `test/` holds the specs).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = process.argv[2] || 'jest-e2e.config.json';
const extraArgs = process.argv.slice(3);
const jestBin = require.resolve('jest/bin/jest');

const testDir = path.resolve('test');
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.e2e-spec.ts'))
  .sort();

if (files.length === 0) {
  console.error(`No *.e2e-spec.ts files found in ${testDir}`);
  process.exit(1);
}

const failed = [];
for (const file of files) {
  const rel = path.join('test', file);
  console.log(`\n── ${rel} ──`);
  const result = spawnSync(
    process.execPath,
    [jestBin, '--config', config, '--runInBand', ...extraArgs, rel],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) failed.push(file);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} e2e suite(s) failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${files.length} e2e suites passed (isolated processes).`);
