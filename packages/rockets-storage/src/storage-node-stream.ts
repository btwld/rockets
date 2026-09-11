import { Readable } from 'node:stream';

import type { StorageObject } from './storage.types.js';

/**
 * Turn a downloaded object's body into a Node `Readable`.
 *
 * `StorageObject.body` is a web `ReadableStream`, which is the right
 * neutral shape — but TypeScript resolves the bare `ReadableStream` name
 * against whatever lib the CONSUMER has. A project with `"DOM"` in `lib`
 * binds it to the DOM declaration, and `Readable.fromWeb()` is typed
 * against `node:stream/web`, so passing one to the other is an error even
 * though the runtime object is the same. Every Node server hits this the
 * first time it pipes an object into a response.
 *
 * The conversion is safe by runtime identity: on the supported Node
 * versions there is exactly one `ReadableStream` implementation, and the
 * two declarations describe it. Keeping the assertion HERE, once and
 * explained, is the point — without it each consumer writes its own
 * undocumented cast.
 *
 * ```ts
 * const object = await storage.downloadStream(key);
 * return new StreamableFile(toNodeReadable(object), { type: object.contentType });
 * ```
 */
export function toNodeReadable(
  source: StorageObject | StorageObject['body'],
): Readable {
  const body = 'body' in source ? source.body : source;
  return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
}
