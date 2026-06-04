import type { RepositoryProviderOptions } from '@bitwild/rockets-repository';
import type { PlainLiteralObject } from '@nestjs/common';

export interface FirestoreProviderOptions<
  Entity extends PlainLiteralObject = PlainLiteralObject,
> extends RepositoryProviderOptions<Entity> {
  /** Firestore collection id (defaults to entity registration key). */
  readonly collection?: string;
  /**
   * Soft-delete column (auto-detected when the entity has `dateRemoved` or
   * `deletedAt`; set explicitly when the class shape is not detectable).
   */
  readonly softDeleteField?: string;
}
