import { CrudParsedQueryInterface as CrudRequestInterface } from '@concepta/nestjs-crud';
import { RocketsAuthUserMetadataEntityInterface } from './rockets-auth-user-metadata-entity.interface';

/**
 * Request interface for user metadata operations
 */
export interface RocketsAuthUserMetadataRequestInterface
  extends CrudRequestInterface<RocketsAuthUserMetadataEntityInterface> {}
