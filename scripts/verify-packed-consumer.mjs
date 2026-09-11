import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPublicPackageManifests } from './public-package-manifests.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryPrefix = join(tmpdir(), 'rockets-packed-consumer-');
const temporaryRoot = mkdtempSync(temporaryPrefix);
const tarballsRoot = join(temporaryRoot, 'tarballs');
const consumerRoot = join(temporaryRoot, 'consumer');
const coreOnlyConsumerRoot = join(temporaryRoot, 'consumer-core-only');
const storageProviderConsumerRoot = join(
  temporaryRoot,
  'consumer-storage-provider',
);

const consumerDependencies = [
  '@aws-sdk/client-s3@3.1103.0',
  '@aws-sdk/lib-storage@3.1103.0',
  '@aws-sdk/s3-presigned-post@3.1103.0',
  '@aws-sdk/s3-request-presigner@3.1103.0',
  '@nestjs/common@12.0.1',
  '@nestjs/core@12.0.1',
  '@nestjs/platform-express@12.0.1',
  '@nestjs/typeorm@12.0.1',
  '@types/node@20.19.43',
  'firebase-admin@13.10.0',
  'reflect-metadata@0.1.14',
  'rxjs@7.8.2',
  'typeorm@0.3.31',
  'typescript@5.9.3',
  'zod@4.4.3',
];

function run(command, args, cwd, options = {}) {
  try {
    execFileSync(command, args, {
      cwd,
      encoding: options.quiet ? 'utf8' : undefined,
      env: process.env,
      stdio: options.quiet ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (options.quiet) {
      if (error.stdout) process.stdout.write(error.stdout);
      if (error.stderr) process.stderr.write(error.stderr);
    }
    throw error;
  }
}


/**
 * Every resolved version of `name` under `root`, keyed by version.
 *
 * Nest resolves DI tokens by CLASS IDENTITY, so a second copy of
 * `@nestjs/core` is not a size problem — `ModuleRef` from one copy is not
 * the token the other provides, and the app fails to boot with
 * "Nest can't resolve dependencies of X (?, Reflector)". `@nestjs/cqrs`
 * fails earlier and louder: `RESULT_TYPE_SYMBOL` is a `unique symbol`, so
 * two copies make `Query<T>` two incompatible types (TS2420).
 *
 * The workspace cannot see either: the root `resolutions` block flattens
 * the tree. Only this consumer install has the shape a published package
 * actually gets, which is why the assertion lives here.
 */
function resolvedVersions(root, name) {
  const found = new Map();
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = join(dir, entry.name);
      if (entry.name === 'node_modules') {
        walk(child, depth + 1);
        continue;
      }
      if (entry.name.startsWith('@') || entry.isDirectory()) {
        const manifest = join(child, 'package.json');
        try {
          const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
          if (parsed.name === name && typeof parsed.version === 'string') {
            const at = found.get(parsed.version) ?? [];
            at.push(child.slice(root.length + 1));
            found.set(parsed.version, at);
          }
        } catch {
          // not a package directory; keep walking
        }
        walk(child, depth);
      }
    }
  };
  walk(join(root, 'node_modules'), 0);
  return found;
}

/**
 * `@concepta/nestjs-{email,event,common}` are still on the v7 line and
 * declare Nest 11 as a HARD dependency, so npm must nest a copy under
 * each. Tolerated by PATH, not by version: keyed on the version alone, a
 * NEW package that starts nesting the same Nest 11 build for an
 * unrelated reason would slip through the gate silently.
 */
const TOLERATED_NEST_DUPLICATE_PATHS = [
  '@concepta/nestjs-email/node_modules/',
  '@concepta/nestjs-event/node_modules/',
  '@concepta/nestjs-common/node_modules/',
];

function assertSingleNestInstance(root, name) {
  const found = resolvedVersions(root, name);
  const offending = [...found.entries()]
    .filter(([, paths]) =>
      paths.some(
        (path) =>
          !TOLERATED_NEST_DUPLICATE_PATHS.some((tolerated) =>
            path.includes(tolerated),
          ),
      ),
    )
    .map(([version]) => version);
  if (offending.length <= 1) return;
  const detail = offending
    .map((v) => `  ${v}\n${found.get(v).map((p) => `    ${p}`).join('\n')}`)
    .join('\n');
  throw new Error(
    `${name} resolved to ${offending.length} different versions in the ` +
      `packed consumer. Nest resolves DI tokens by class identity, so two ` +
      `copies break \`ModuleRef\`/\`Reflector\` injection at boot and make ` +
      `\`unique symbol\` types incompatible.\n${detail}`,
  );
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  mkdirSync(tarballsRoot);
  mkdirSync(consumerRoot);
  mkdirSync(coreOnlyConsumerRoot);
  mkdirSync(storageProviderConsumerRoot);

  const workspaces = readPublicPackageManifests(repositoryRoot, {
    namePrefix: '@concepta/',
  });
  if (workspaces.length === 0) {
    throw new Error('No public @concepta/* workspaces were found.');
  }

  const versions = new Set(workspaces.map((manifest) => manifest.version));
  if (versions.size !== 1) {
    throw new Error(
      `Public workspace versions are not aligned: ${[...versions].join(', ')}`,
    );
  }

  const tarballs = workspaces.map((manifest) => {
    const filename = `${manifest.name.replace('@', '').replace('/', '-')}-${
      manifest.version
    }.tgz`;
    const tarball = join(tarballsRoot, filename);
    run(
      'corepack',
      ['yarn', 'workspace', manifest.name, 'pack', '--out', tarball],
      repositoryRoot,
      { quiet: true },
    );
    return tarball;
  });
  const coreTarball = tarballs.find((tarball) =>
    tarball.includes('concepta-rockets-core-'),
  );
  if (coreTarball === undefined) {
    throw new Error('Missing @concepta/rockets-core tarball.');
  }
  const storageTarball = tarballs.find((tarball) =>
    tarball.includes('concepta-rockets-storage-'),
  );
  if (storageTarball === undefined) {
    throw new Error('Missing @concepta/rockets-storage tarball.');
  }

  writeJson(join(consumerRoot, 'package.json'), {
    name: 'rockets-packed-consumer-smoke',
    version: '0.0.0',
    private: true,
  });

  // Deliberately NO `--legacy-peer-deps`: this install IS the check that a
  // consumer's default `npm install` resolves. The flag used to hide two
  // real defects in a row — Nest 12 alpha pins that nested 13 copies of
  // `@nestjs/core`, then `@nestjs/throttler`'s Nest 11 peer cap — and both
  // were found by CI or by hand instead of here. If this step answers
  // ERESOLVE, a published package is uninstallable; fix the dependency,
  // never the flag.
  run(
    'npm',
    [
      'install',
      '--save-exact',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      ...tarballs,
      ...consumerDependencies,
    ],
    consumerRoot,
  );

  for (const nestPackage of [
    '@nestjs/core',
    '@nestjs/common',
    '@nestjs/cqrs',
  ]) {
    assertSingleNestInstance(consumerRoot, nestPackage);
  }

  const entrypointChecks = [
    ['@concepta/rockets', 'RocketsModule'],
    ['@concepta/rockets-adapter-firebase', 'FirebaseAuthModule'],
    ['@concepta/rockets-auth', 'RocketsAuthModule'],
    ['@concepta/rockets-core', 'RocketsCoreModule'],
    ['@concepta/rockets-core/zod', 'zodResource'],
    ['@concepta/rockets-core/zod', 'f'],
    ['@concepta/rockets-repository-firestore', 'FirestoreRepositoryModule'],
    ['@concepta/rockets-repository-typeorm', 'TypeOrmRepositoryModule'],
    ['@concepta/rockets-repository-typeorm/zod', 'typeOrmZodEntityCompiler'],
    ['@concepta/rockets-storage', 'StorageModule'],
    ['@concepta/rockets-storage/core', 'StorageClient'],
    ['@concepta/rockets-storage/files-sdk', 'createFilesSdkDriver'],
    ['@concepta/rockets-storage/files-sdk/fs', 'createFsStorageDriver'],
    [
      '@concepta/rockets-storage/files-sdk/provider',
      'createProviderStorageDriver',
    ],
    ['@concepta/rockets-storage/files-sdk/s3', 'createS3StorageDriver'],
    ['@concepta/rockets-storage/testing', 'createMemoryStorageDriver'],
  ];

  writeFileSync(
    join(consumerRoot, 'verify-cjs.cjs'),
    `'use strict';\nconst checks = ${JSON.stringify(
      entrypointChecks,
    )};\nfor (const [specifier, symbol] of checks) {\n  const loaded = require(specifier);\n  if (!(symbol in loaded)) throw new Error(\`Missing \${symbol} from CJS \${specifier}\`);\n}\n`,
  );
  writeFileSync(
    join(consumerRoot, 'verify-esm.mjs'),
    `const checks = ${JSON.stringify(
      entrypointChecks,
    )};\nfor (const [specifier, symbol] of checks) {\n  const loaded = await import(specifier);\n  const commonJsDefault = loaded.default;\n  const exported = symbol in loaded || (typeof commonJsDefault === 'object' && commonJsDefault !== null && symbol in commonJsDefault);\n  if (!exported) throw new Error(\`Missing \${symbol} from ESM \${specifier}\`);\n}\n`,
  );

  writeJson(join(consumerRoot, 'tsconfig.json'), {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      strict: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      outDir: 'dist',
      skipLibCheck: false,
    },
    include: ['consumer.ts'],
  });
  writeFileSync(
    join(consumerRoot, 'consumer.ts'),
    `import 'reflect-metadata';

import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  type AuthAdapterInterface,
  type AuthAttemptResult,
  type AuthRequest,
  RocketsModule,
  defineAuthAdapter,
} from '@concepta/rockets';
import { FirebaseAuthModule } from '@concepta/rockets-adapter-firebase';
import {
  RocketsAuthModule,
  RocketsAuthRecoveryController,
  RocketsAuthTokenController,
  type RocketsAuthOptionsExtrasInterface,
} from '@concepta/rockets-auth';
import { RocketsCoreModule, withOpenApi } from '@concepta/rockets-core';
import { f, zodResource } from '@concepta/rockets-core/zod';
import { FirestoreRepositoryModule } from '@concepta/rockets-repository-firestore';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { typeOrmZodEntityCompiler } from '@concepta/rockets-repository-typeorm/zod';
import { StorageModule } from '@concepta/rockets-storage';
import { StorageClient } from '@concepta/rockets-storage/core';
import { createFilesSdkDriver } from '@concepta/rockets-storage/files-sdk';
import { createFsStorageDriver } from '@concepta/rockets-storage/files-sdk/fs';
import { createProviderStorageDriver } from '@concepta/rockets-storage/files-sdk/provider';
import { createS3StorageDriver } from '@concepta/rockets-storage/files-sdk/s3';
import { createMemoryStorageDriver } from '@concepta/rockets-storage/testing';
import { z } from 'zod';

export const publicPackageSymbols = [
  FirebaseAuthModule,
  FirestoreRepositoryModule,
  RocketsAuthModule,
  RocketsAuthRecoveryController,
  RocketsAuthTokenController,
  RocketsCoreModule,
  TypeOrmRepositoryModule,
  typeOrmZodEntityCompiler,
  StorageClient,
  StorageModule,
  createFilesSdkDriver,
  createFsStorageDriver,
  createProviderStorageDriver,
  createS3StorageDriver,
  createMemoryStorageDriver,
];

export const throttlingConfig: RocketsAuthOptionsExtrasInterface['throttling'] = {
  ip: { limit: 1000, windowMs: 60_000 },
  default: { limit: 100, windowMs: 60_000 },
};

export const consumerSchema = withOpenApi(
  z.object({ id: z.string() }),
  'ConsumerDto',
);
export const consumerZodSurface = { f, zodResource };

@Injectable()
class ConsumerAuthAdapter implements AuthAdapterInterface {
  async authenticate(_request: AuthRequest): Promise<AuthAttemptResult> {
    return { matched: false };
  }
}

@Module({
  imports: [
    StorageModule.forRoot({
      stores: [
        {
          name: 'consumer',
          driver: createMemoryStorageDriver(),
        },
      ],
    }),
    RocketsModule.forRoot({
      settings: {},
      auth: defineAuthAdapter(ConsumerAuthAdapter),
      disableController: { me: true },
      enableGlobalGuard: false,
    }),
  ],
})
class ConsumerModule {}

async function main(): Promise<void> {
  const app = await NestFactory.create(ConsumerModule, {
    abortOnError: false,
    logger: false,
  });
  await app.init();
  await app.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
`,
  );
  writeJson(join(consumerRoot, 'tsconfig.storage-node10.json'), {
    compilerOptions: {
      module: 'CommonJS',
      moduleResolution: 'Node10',
      target: 'ES2022',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ['storage-node10.ts'],
  });
  writeFileSync(
    join(consumerRoot, 'storage-node10.ts'),
    `import { StorageModule } from '@concepta/rockets-storage';
import type { StorageDriver } from '@concepta/rockets-storage/core';
import type { FilesSdkDriverOptions } from '@concepta/rockets-storage/files-sdk';

type LegacyStorageSurface = readonly [
  typeof StorageModule,
  StorageDriver,
  FilesSdkDriverOptions<never>,
];

declare const legacyStorageSurface: LegacyStorageSurface;
void legacyStorageSurface;
`,
  );

  // Second legacy fixture: same Node10 resolution, but `skipLibCheck: true`
  // — what Nest's own scaffolding and every example in this repo use. There
  // the DRIVER subpaths resolve too, and that is the difference between
  // "storage is unusable on a legacy tsconfig" and "storage works, you just
  // cannot deep-check upstream's types". What makes them resolve is
  // `typesVersions` in the package manifest; drop an entry and this stops
  // compiling. It cannot be folded into the strict fixture above: the
  // driver `.d.ts` re-export types from `files-sdk`, which is ESM with an
  // export map and no `typesVersions`, so Node10 cannot follow them — not
  // something this package can fix from its side.
  writeJson(join(consumerRoot, 'tsconfig.storage-node10-drivers.json'), {
    compilerOptions: {
      module: 'CommonJS',
      moduleResolution: 'Node10',
      target: 'ES2022',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['storage-node10-drivers.ts'],
  });
  writeFileSync(
    join(consumerRoot, 'storage-node10-drivers.ts'),
    `import { createFsStorageDriver } from '@concepta/rockets-storage/files-sdk/fs';
import { createProviderStorageDriver } from '@concepta/rockets-storage/files-sdk/provider';
import { createS3StorageDriver } from '@concepta/rockets-storage/files-sdk/s3';
import { createMemoryStorageDriver } from '@concepta/rockets-storage/testing';

type LegacyDriverSurface = readonly [
  typeof createFsStorageDriver,
  typeof createProviderStorageDriver,
  typeof createS3StorageDriver,
  typeof createMemoryStorageDriver,
];

declare const legacyDriverSurface: LegacyDriverSurface;
void legacyDriverSurface;
`,
  );

  run(process.execPath, ['verify-cjs.cjs'], consumerRoot);
  run(process.execPath, ['verify-esm.mjs'], consumerRoot);
  run(
    process.execPath,
    [join(consumerRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'],
    consumerRoot,
  );
  run(
    process.execPath,
    [
      join(consumerRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      'tsconfig.storage-node10.json',
    ],
    consumerRoot,
  );
  run(
    process.execPath,
    [
      join(consumerRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      'tsconfig.storage-node10-drivers.json',
    ],
    consumerRoot,
  );
  run(process.execPath, [join('dist', 'consumer.js')], consumerRoot);

  writeJson(join(coreOnlyConsumerRoot, 'package.json'), {
    name: 'rockets-core-only-consumer-smoke',
    version: '0.0.0',
    private: true,
  });
  run(
    'npm',
    [
      'install',
      '--save-exact',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      coreTarball,
      '@nestjs/common@12.0.1',
      '@nestjs/core@12.0.1',
      'reflect-metadata@0.1.14',
      'rxjs@7.8.2',
    ],
    coreOnlyConsumerRoot,
  );
  writeFileSync(
    join(coreOnlyConsumerRoot, 'verify-core-only.cjs'),
    `'use strict';\nrequire('reflect-metadata');\nconst loaded = require('@concepta/rockets-core');\nif (!('RocketsCoreModule' in loaded)) throw new Error('Missing RocketsCoreModule from @concepta/rockets-core');\n`,
  );
  run(process.execPath, ['verify-core-only.cjs'], coreOnlyConsumerRoot);

  writeJson(join(storageProviderConsumerRoot, 'package.json'), {
    name: 'rockets-storage-provider-peer-minimal-smoke',
    version: '0.0.0',
    private: true,
    type: 'module',
  });
  run(
    'npm',
    [
      'install',
      '--save-exact',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      storageTarball,
      '@types/node@20.19.43',
      'typescript@5.9.3',
    ],
    storageProviderConsumerRoot,
  );
  writeJson(join(storageProviderConsumerRoot, 'tsconfig.json'), {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ['consumer.ts'],
  });
  writeFileSync(
    join(storageProviderConsumerRoot, 'consumer.ts'),
    `import {
  createProviderStorageDriver,
  type ProviderStorageDriverOptions,
} from '@concepta/rockets-storage/files-sdk/provider';

const options: ProviderStorageDriverOptions = {
  provider: 'fs',
  config: { root: './storage' },
};
void createProviderStorageDriver;
void options;
`,
  );
  run(
    process.execPath,
    [
      join(
        storageProviderConsumerRoot,
        'node_modules',
        'typescript',
        'bin',
        'tsc',
      ),
      '-p',
      '.',
    ],
    storageProviderConsumerRoot,
  );

  console.log(
    `Verified ${workspaces.length} packed public packages in clean CJS, ESM, TypeScript, Nest, legacy-resolution, and peer-minimal consumers.`,
  );
} finally {
  if (!temporaryRoot.startsWith(temporaryPrefix)) {
    throw new Error(`Refusing to clean unexpected path: ${temporaryRoot}`);
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
