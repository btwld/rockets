import type {
  StorageBody,
  StorageCapabilities,
  StorageConditionalDeleteOptions,
  StorageConditionalReadOptions,
  StorageConditionalUploadOptions,
  StorageDownloadOptions,
  StorageListOptions,
  StorageListResult,
  StorageObject,
  StorageObjectMetadata,
  StorageOperationOptions,
  StoragePromotionOptions,
  StorageSearchOptions,
  StorageSignedDownloadOptions,
  StorageSignedUpload,
  StorageSignedUploadOptions,
  StorageUploadOptions,
  StorageUploadResult,
} from './storage.types.js';

export interface StorageDriver {
  readonly name: string;
  readonly capabilities: StorageCapabilities;

  upload(
    key: string,
    body: StorageBody,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResult>;
  uploadConditional?(
    key: string,
    body: StorageBody,
    options: StorageConditionalUploadOptions,
  ): Promise<StorageUploadResult>;
  download(
    key: string,
    options?: StorageDownloadOptions,
  ): Promise<StorageObject>;
  downloadConditional?(
    key: string,
    options: StorageConditionalReadOptions,
  ): Promise<StorageObject>;
  head(
    key: string,
    options?: StorageOperationOptions,
  ): Promise<StorageObjectMetadata>;
  exists(key: string, options?: StorageOperationOptions): Promise<boolean>;
  delete(key: string, options?: StorageOperationOptions): Promise<void>;
  deleteConditional?(
    key: string,
    options: StorageConditionalDeleteOptions,
  ): Promise<void>;
  copy(
    sourceKey: string,
    destinationKey: string,
    options?: StorageOperationOptions,
  ): Promise<void>;
  move(
    sourceKey: string,
    destinationKey: string,
    options?: StorageOperationOptions,
  ): Promise<void>;
  /**
   * Conditionally copies a staged object to its final key. The source remains
   * in place so applications can delete it only after their metadata commit.
   */
  promote?(
    sourceKey: string,
    destinationKey: string,
    options: StoragePromotionOptions,
  ): Promise<void>;
  /**
   * Lists one page and, when more entries remain, returns an opaque cursor for
   * the next logical position. Cursors are bound to the request's `prefix` and
   * `delimiter`; callers may choose a different supported `limit` when they
   * resume.
   *
   * A cursor is non-consuming. Reusing it, including after following any
   * descendant cursor, must resume from the same logical position while the
   * provider namespace is unchanged. It must also work with an independently
   * constructed compatible driver and client that address the same store with
   * the same backend configuration while the provider token remains valid and
   * available. Drivers must not make cursor state local to one process, client,
   * or session.
   *
   * This contract does not provide snapshot isolation: concurrent namespace
   * mutations may change subsequent pages. It does not guarantee provider
   * token lifetime or backend availability, and provider invalidation remains
   * an ordinary list-operation failure.
   */
  list(options?: StorageListOptions): Promise<StorageListResult>;
  search(
    pattern: string | RegExp,
    options?: StorageSearchOptions,
  ): AsyncIterable<StorageObjectMetadata>;
  signDownload(
    key: string,
    options?: StorageSignedDownloadOptions,
  ): Promise<string>;
  signUpload(
    key: string,
    options: StorageSignedUploadOptions,
  ): Promise<StorageSignedUpload>;
  close?(): void | Promise<void>;
}
