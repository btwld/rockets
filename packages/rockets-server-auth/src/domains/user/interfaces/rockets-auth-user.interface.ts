import { ReferenceIdInterface } from '@concepta/nestjs-core';
import { UserInterface } from '@concepta/nestjs-user';
import { RocketsAuthUserMetadataEntityInterface } from './rockets-auth-user-metadata-entity.interface';

/**
 * Rockets Server User Interface (DTO shape)
 *
 * Extends the base user interface and ReferenceIdInterface to include id.
 */
export interface RocketsAuthUserInterface
  extends UserInterface,
    ReferenceIdInterface {
  userMetadata?:
    | Record<string, unknown>
    | RocketsAuthUserMetadataEntityInterface;
}
