import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

/**
 * Settings every test project shares. Deliberately NOT the root config —
 * the root declares `test.projects`, and merging a projects-bearing config
 * into a project turns it into a nested-projects container (documented
 * Vitest pitfall). Projects `mergeConfig(shared, defineProject({...}))`.
 */
export default defineProject({
  plugins: [
    // Vitest's default esbuild transform does not emit decorator metadata,
    // which Nest DI requires; SWC does when configured below.
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2021',
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    // Explicit imports only (`import { describe } from 'vitest'`) — no
    // ambient globals, so nothing depends on typings being magically
    // present. Stricter than the NestJS recipe on purpose.
    globals: false,
    environment: 'node',
    // Preloads the ESM `@nestjs/core` graph so a CommonJS `require()` of it
    // (from `@nestjs/cqrs`) never lands mid-evaluation — Node 20.19 throws
    // ERR_REQUIRE_CYCLE_MODULE there. See the file for the full note.
    // Absolute: `setupFiles` resolves against each PROJECT's root (the
    // example workspaces included), not this file's directory.
    setupFiles: [
      fileURLToPath(new URL('./vitest.setup.preload-nest-core.mts', import.meta.url)),
    ],
    // Fresh process per spec file. These suites boot full Nest + TypeORM
    // apps; sharing a process flaked ~25% of full runs under Jest.
    pool: 'forks',
  },
});
