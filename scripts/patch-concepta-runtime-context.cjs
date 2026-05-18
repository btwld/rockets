/**
 * @concepta/nestjs-common and @concepta/nestjs-crud RuntimeException subclasses
 * merge `super.context` after `super()`, but `super.context` is undefined in
 * derived constructors, so `Object.assign({}, super.context)` wipes
 * `context.originalError` (including HttpException causes from repo hooks).
 *
 * Replace those merges with `this.context`, which already holds the parent
 * context after `super()` returns.
 *
 * Idempotent: safe to run on every install.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const files = [
  'node_modules/@concepta/nestjs-common/dist/model/exceptions/model-query.exception.js',
  'node_modules/@concepta/nestjs-common/dist/model/exceptions/model-mutate.exception.js',
  'node_modules/@concepta/nestjs-common/dist/model/exceptions/model-validation.exception.js',
  'node_modules/@concepta/nestjs-common/dist/model/exceptions/model-id-no-match.exception.js',
  'node_modules/@concepta/nestjs-crud/dist/infrastructure/exceptions/crud.exception.js',
  'node_modules/@concepta/nestjs-crud/dist/infrastructure/exceptions/crud-query.exception.js',
];

const needle = 'Object.assign({}, super.context)';
const replacement = 'Object.assign({}, this.context)';

const needle2 = 'Object.assign(Object.assign({}, super.context),';
const replacement2 = 'Object.assign(Object.assign({}, this.context),';

for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    continue;
  }
  let src = fs.readFileSync(abs, 'utf8');
  const before = src;
  if (src.includes(needle)) {
    src = src.split(needle).join(replacement);
  }
  if (src.includes(needle2)) {
    src = src.split(needle2).join(replacement2);
  }
  if (src !== before) {
    fs.writeFileSync(abs, src, 'utf8');
    console.log(`[patch-concepta-runtime-context] ${rel}`);
  }
}
