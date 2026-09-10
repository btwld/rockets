# @concepta/rockets-storage

[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Provider-neutral object storage for Rockets applications: streaming clients,
> named NestJS stores, structured signed transfers, normalized errors,
> hardened filesystem/S3 wrappers, runtime provider selection, and reusable
> conformance tests.

**Status:** pre-1.0 preview. Pin the exact alpha version in production.

## Why this package exists

Rockets already separates database code from concrete persistence through
`RepositoryInterface`. Object storage needs a different boundary: its values are
streams, its operations include ranges and signed requests, and its providers
have different conditional-write and policy capabilities.

Without a shared storage layer, each application repeats provider SDK setup,
dependency-injection tokens, streaming conversions, error mapping, retries,
signed-upload policy checks, and test doubles. `@concepta/rockets-storage`
centralizes those concerns while keeping object keys, tenant authorization,
database metadata, and domain policy in the application.

This package implements the storage runtime tracked in
[Rockets issue #106](https://github.com/conceptadev/rockets/issues/106) and
complements the upload work tracked in
[Rockets issue #86](https://github.com/conceptadev/rockets/issues/86). It does
not add multipart parsing or generated upload routes to `rockets-core`.
[PR #94](https://github.com/conceptadev/rockets/pull/94) separately explores an
operation-level signed-link seam; this package does not bind that PR's
`FILE_STORAGE_SERVICE_TOKEN` while its core contract remains under review.
Applications can inject a `StorageClient` into an ordinary service or an
`operationResource` handler without coupling core to S3, GCS, Azure, or a local
filesystem.

## Requirements

- Node.js 20.19+ on the Node 20 line, or Node.js 22.12+.
- NestJS 12 for the root Nest module entry point.
- ESM internally. On supported Node versions the published entry points work
  with both `import` and synchronous `require()`.
- TypeScript `moduleResolution: "node16"`, `"nodenext"`, or `"bundler"` for
  `/files-sdk/fs`, `/files-sdk/provider`, `/files-sdk/s3`, and `/testing`.
  The root, `/core`, and `/files-sdk` also resolve with legacy Node10
  resolution; `files-sdk` provider subpaths publish modern export maps only.

The `@concepta/rockets-storage/core` entry point has no NestJS runtime or type
dependency. Nest, RxJS, AWS SDK, and other provider SDK peers are optional and
are needed only by the entry points that use them.

## Install

```bash
yarn add @concepta/rockets-storage@alpha
```

Install only the native SDK required by the selected provider. For S3 and
S3-compatible providers:

```bash
yarn add @aws-sdk/client-s3 @aws-sdk/lib-storage \
  @aws-sdk/s3-presigned-post @aws-sdk/s3-request-presigner
```

`@aws-sdk/client-s3` 3.919.0 or newer is required. That is the first version
whose `CopyObject` request serializes destination conditions used by the
conditional-copy contract.

## Entry points

| Import                                         | Purpose                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `@concepta/rockets-storage`                    | Nest module, named-store injection, client, service, and core contracts |
| `@concepta/rockets-storage/core`               | Framework-neutral client, driver, errors, types, and upload control     |
| `@concepta/rockets-storage/files-sdk`          | Explicit Files SDK bridge                                               |
| `@concepta/rockets-storage/files-sdk/fs`       | Package-owned local filesystem driver                                   |
| `@concepta/rockets-storage/files-sdk/provider` | Runtime provider catalog and lazy provider selection                    |
| `@concepta/rockets-storage/files-sdk/s3`       | Hardened AWS S3 and S3-compatible drivers                               |
| `@concepta/rockets-storage/testing`            | In-memory driver and provider conformance contract                      |

Provider SDK types and raw clients do not leak through the root package.

## Configure named stores

Use `StorageModule.forRoot()` for synchronous drivers. The module is not global
unless `isGlobal: true` is explicitly requested.

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@concepta/rockets-storage';
import { createFsStorageDriver } from '@concepta/rockets-storage/files-sdk/fs';
import { createS3StorageDriver } from '@concepta/rockets-storage/files-sdk/s3';

export const StorageKey = {
  MEDIA: 'media',
  ARCHIVE: 'archive',
} as const;

@Module({
  imports: [
    StorageModule.forRoot({
      default: StorageKey.MEDIA,
      stores: [
        {
          name: StorageKey.MEDIA,
          driver: createS3StorageDriver({
            adapter: {
              bucket: 'media',
              region: 'us-east-1',
            },
          }),
        },
        {
          name: StorageKey.ARCHIVE,
          driver: createFsStorageDriver({
            adapter: { root: './var/archive' },
          }),
        },
      ],
    }),
  ],
  exports: [StorageModule],
})
export class AppStorageModule {}
```

Inject one store directly:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectStorage, type StorageClient } from '@concepta/rockets-storage';

@Injectable()
export class AvatarService {
  constructor(
    @InjectStorage(StorageKey.MEDIA)
    private readonly media: StorageClient,
  ) {}

  upload(userId: string, body: ReadableStream<Uint8Array>) {
    return this.media.upload(`avatars/${userId}.png`, body, {
      contentType: 'image/png',
    });
  }
}
```

Or inject `StorageService` when an application selects stores at runtime:

```typescript
const media = storage.use();
const archive = storage.use(StorageKey.ARCHIVE);
```

Invalid store names, duplicates, and a missing requested default fail during
registration. A single store becomes the implicit default; multiple stores
require either `default` or an explicit `storage.use(name)` call.

### Asynchronous registration

`forRootAsync()` supports `useFactory`, `useClass`, and `useExisting` per
store. Imports declared on the root options and individual store factories are
preserved and de-duplicated.

```typescript
StorageModule.forRootAsync({
  default: 'media',
  imports: [ConfigModule],
  stores: [
    {
      name: 'media',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createProviderStorageDriver({
          provider: config.getOrThrow('STORAGE_PROVIDER'),
          prefix: config.get('STORAGE_PREFIX'),
          config: {
            bucket: config.get('STORAGE_BUCKET'),
            region: config.get('STORAGE_REGION'),
            root: config.get('STORAGE_ROOT'),
          },
        }),
    },
  ],
});
```

`forFeature()` and `forFeatureAsync()` register named clients without a
package-level `StorageService`, which is useful for feature-owned stores.

## Framework-neutral core

Workers and scripts can use the client without NestJS:

```typescript
import {
  StorageClient,
  type StorageDriver,
} from '@concepta/rockets-storage/core';

declare const driver: StorageDriver;

const media = new StorageClient('media', driver);
await media.upload('avatars/user.png', image, {
  contentType: 'image/png',
});
await media.onApplicationShutdown();
```

Downloads stream by default:

```typescript
const object = await media.downloadStream('video.mp4');
// object.body is ReadableStream<Uint8Array>
```

Buffering is explicit and bounded. `downloadBytes`, `downloadText`, and
`downloadJson` default to a 10 MiB limit and accept a smaller `maxBytes` value.

```typescript
const manifest = await media.downloadJson<{ version: number }>(
  'manifest.json',
  { maxBytes: 256 * 1024 },
);
```

The client also provides metadata, existence checks, delete, copy, move,
list/search, bulk operations, cross-store transfer/sync, resumable uploads,
conditional operations, and signed transfers.

## Signed uploads are structured

A signed upload is not always one bare URL. Providers may require signed PUT
headers or a POST form with provider-generated fields, so the public result is
a discriminated union:

```typescript
type StorageSignedUpload =
  | {
      method: 'PUT';
      url: string;
      headers?: Record<string, string>;
    }
  | {
      method: 'POST';
      url: string;
      fields: Record<string, string>;
    };
```

```typescript
const upload = await media.signUpload('avatars/user.png', {
  expiresIn: 300,
  contentType: 'image/png',
  maxSize: 5 * 1024 * 1024,
});
```

Applications must return the method and its headers or fields to the client.
Returning only `upload.url` can silently discard constraints needed for the
request to succeed.

Providers separately advertise whether their signed request actually enforces
content type and size range. A requested guarantee that the selected provider
cannot enforce fails with `NOT_SUPPORTED` before a URL is minted.

## Signed downloads honor the requested expiry or fail

`signDownload` applies the same rule. A store advertises
`capabilities.signedDownloadPolicy.expiresIn` when every URL it mints honors
the requested expiry. Whether a signed URL honors the requested expiry is a
per-provider detail that no capability can infer — some providers pin the
lifetime server-side and ignore the request — so a store that does not
advertise the guarantee cannot be asked for one.

```typescript
await storage.use('media').signDownload('avatar.png', { expiresIn: 300 });
```

- Requesting `expiresIn` on a store that does not advertise `expiresIn: true`
  fails with `NOT_SUPPORTED` rather than returning a URL that ignores it. An
  S3 store configured with `publicBaseUrl` serves permanent public URLs and
  reports `expiresIn: false`, so it rejects the request.
- **Only the S3 adapter advertises this capability today.** Every other
  provider — GCS, Azure, R2 and other S3-compatible endpoints reached through
  the runtime provider entry point, the filesystem driver, third-party
  drivers — leaves `signedDownloadPolicy` undeclared and therefore rejects
  `expiresIn` until its adapter declares the guarantee. `signDownload` without
  `expiresIn` keeps working everywhere.
- `expiresIn` that is not a positive safe integer fails with
  `INVALID_ARGUMENT`, and so does one above the applicable ceiling. Two
  ceilings can apply and the lower wins:
  `capabilities.signedDownload.maxExpiresIn` is a limit the provider enforces
  in code (Dropbox pins temporary links to 4 hours), and
  `capabilities.signedDownloadPolicy.maxExpiresIn` is a documented limit of
  the adapter's signature format that the provider does not itself enforce
  (AWS SigV4 stops at 7 days).
- Omitting `expiresIn` does **not** mean "never expires": the provider's own
  default applies, and this package neither sets nor verifies it. Pass an
  explicit value whenever the expiry matters.

## Cross-store transfer and sync

`StorageService.transfer()` copies objects between two stores.
`StorageService.sync()` makes a destination prefix match a source, and with
`prune: true` it also **deletes** destination objects the source no longer has.
Both take `prefix`, `transformKey`, and `onProgress`; `destinationPrefix`,
`dryRun`, and `prune` belong to `sync()` alone, and `overwrite` to
`transfer()`. On both, `limit` is the list page size used while walking, not a
cap on the number of objects.

`sync()` decides what is unchanged with `compare`, which is `'etag'`,
`'size'`, or a predicate. ETags are opaque, per-driver tokens: the filesystem
driver emits a truncated sha1, S3 an md5. Syncing across two stores whose
drivers differ, without an explicit `compare`, fails with `INVALID_ARGUMENT`
rather than silently re-uploading every object on every run. The check is on
the driver name, so it is deliberately conservative — S3-compatible endpoints
under different driver names (MinIO, Wasabi, Spaces) do produce comparable
ETags, and those callers pass `compare: 'etag'` explicitly. Matching driver
names are not a guarantee either: two S3 buckets with different multipart part
sizes yield different ETags for identical content.

```typescript
await storage.sync({
  compare: 'size',
  from: 'staging',
  to: 'archive',
});
```

## Exact conditional operations

The capability contract distinguishes conditional create, replace, delete,
read, source copy, destination copy, atomic source-and-destination promotion,
and multipart completion. Missing capabilities are unsupported; the package
never emulates compare-and-swap with an `exists()` or `head()` request followed
by an unconditional write.

Storage-facing ETags are bare, case-sensitive opaque tokens. Quoted, weak,
wildcard, list-shaped, whitespace-bearing, control-bearing, and non-ASCII
values fail closed. Preserve the exact ETag returned by a read or write and
pass it back unchanged:

```typescript
const current = await media.head('avatars/user.png');
if (current.etag === undefined) {
  throw new Error('The provider cannot identify this object generation.');
}

await media.uploadConditional('avatars/user.png', nextImage, {
  condition: { type: 'replace', etag: current.etag },
  contentType: 'image/png',
});
```

S3-compatible conditional behavior is unlocked only by a verified provider
profile. Native AWS uses the built-in AWS profile. Cloudflare R2 uses a
separate narrower profile. Unknown custom endpoints are read-only until the
application supplies a conformance-verified profile.

Files SDK conditional verbs currently bypass its ordinary operation pipeline.
To prevent hooks, plugins, or receipts from observing only some writes, the
bridge fails closed whenever caller policy is active:

| Files SDK caller options | Conditional behavior |
| --- | --- |
| No custom plugins, active hooks, or receipts | Exact capabilities from the verified adapter are exposed. |
| Any custom plugin, `onAction`/`onError`/`onRetry` hook, or receipts | Conditional capabilities are hidden and direct conditional calls fail with `NOT_SUPPORTED`. |

## Provider adapters

### Local filesystem

```typescript
import { createFsStorageDriver } from '@concepta/rockets-storage/files-sdk/fs';

const driver = createFsStorageDriver({
  adapter: { root: './var/storage' },
});
```

Object bytes are written at `<root>/<key>`. A `<key>.meta.json` sidecar stores
content type, ETag, and metadata. Sidecars never appear as logical keys, and a
logical key ending in `.meta.json` is rejected to prevent collisions.

### AWS S3 and compatible endpoints

```typescript
import { createS3StorageDriver } from '@concepta/rockets-storage/files-sdk/s3';

const driver = createS3StorageDriver({
  adapter: {
    bucket: 'media',
    region: 'us-east-1',
  },
});
```

The adapter binds provider provenance and capability declarations to the raw
client and installed operation surface. This prevents a wrapper from retaining
a broader capability profile after replacing its public adapter members.

### Select a provider at runtime

```typescript
import {
  createProviderStorageDriver,
  isStorageProvider,
  listStorageProviders,
} from '@concepta/rockets-storage/files-sdk/provider';
```

`createProviderStorageDriver()` receives a provider slug and imports only that
adapter. Validate an untrusted environment value with `isStorageProvider()`.
The catalog helpers expose provider names and environment-variable contracts
without loading provider SDKs.

## Errors

All provider failures cross the application boundary as `StorageError`.
Branch on the stable code, not a provider-specific exception:

```typescript
import { isStorageError, StorageErrorCode } from '@concepta/rockets-storage';

try {
  await media.head(key);
} catch (error) {
  if (isStorageError(error) && error.code === StorageErrorCode.NOT_FOUND) {
    return null;
  }
  throw error;
}
```

Codes include `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`, `READ_ONLY`,
`INVALID_ARGUMENT`, `NOT_SUPPORTED`, `ABORTED`, `TIMEOUT`, `LIMIT_EXCEEDED`,
and `PROVIDER`. Provider payloads and raw causes are not retained in errors
returned by hardened adapters.

## Testing and provider conformance

Use the in-memory driver for application tests:

```typescript
import { createMemoryStorageDriver } from '@concepta/rockets-storage/testing';

StorageModule.forRoot({
  stores: [
    {
      name: 'test',
      driver: createMemoryStorageDriver({
        adapter: { initial: { 'fixtures/hello.txt': 'hello' } },
      }),
    },
  ],
});
```

`createStorageProviderConformanceCases()` supplies reusable behavioral cases
for a real provider fixture. Run them against disposable credentials before
claiming conditional, range, cursor, or signed-policy capabilities for a new
adapter. Live cloud conformance remains opt-in; unit tests do not contact a
provider.

`yarn workspace @concepta/rockets-storage test:e2e` always runs the complete
filesystem contract. The same suite registers AWS S3, Cloudflare R2, and
custom/MinIO-style contracts as skipped unless `STORAGE_CONFORMANCE_LIVE=true`
and that provider's documented `STORAGE_CONFORMANCE_*` credentials are set.
Use a disposable bucket: version-aware cases enumerate and delete object
versions and delete markers during cleanup.

## Deliberate boundaries

This first package does not own:

- inbound multipart parsing or generated upload routes;
- database file entities or object-key naming;
- tenant/owner authorization;
- image processing, malware scanning, or transcoding;
- product-specific artifact formats or encryption policy;
- an HTTP storage gateway; or
- capability-scoped agent workspaces and AI tools.

Those features can compose over `StorageClient` without widening the provider
boundary or adding their dependencies to the root entry point.

## License

BSD-3-Clause.
