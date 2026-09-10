// Registered as `setupFiles` for every project (see vitest.shared.mts).
//
// `@nestjs/cqrs` is CommonJS and `require()`s the ESM `@nestjs/core`. The
// runner imports `@nestjs/core` asynchronously as an external; when a
// CommonJS module requires it while that import is still evaluating, Node
// 20.19 (the published floor) throws ERR_REQUIRE_CYCLE_MODULE — Node 22
// tolerates it. Preloading the ESM graph before any spec module runs
// makes the later synchronous require find an evaluated module. Consumers
// whose own test runner externalises ESM the same way need the same
// preload on Node 20.19; the gap is upstream's (a CJS package requiring
// an ESM peer). Remove this file once `@nestjs/cqrs` ships ESM — tracked
// upstream in https://github.com/nestjs/nest/issues/17583.
await import('@nestjs/core');
