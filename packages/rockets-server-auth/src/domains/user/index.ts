// DTOs
export { RocketsAuthUserDto } from './dto/rockets-auth-user.dto';
export { RocketsAuthUserCreateDto } from './dto/rockets-auth-user-create.dto';
export { RocketsAuthUserUpdateDto } from './dto/rockets-auth-user-update.dto';
export { RocketsAuthUserMetadataDto } from './dto/rockets-auth-user-metadata.dto';

// Interfaces
export { RocketsAuthUserInterface } from './interfaces/rockets-auth-user.interface';
export { RocketsAuthUserEntityInterface } from './interfaces/rockets-auth-user-entity.interface';
export { RocketsAuthUserCreatableInterface } from './interfaces/rockets-auth-user-creatable.interface';
export { RocketsAuthUserUpdatableInterface } from './interfaces/rockets-auth-user-updatable.interface';
export { RocketsAuthUserMetadataEntityInterface } from './interfaces/rockets-auth-user-metadata-entity.interface';
export { RocketsAuthUserMetadataCreateDtoInterface } from './interfaces/rockets-auth-user-metadata-dto.interface';

// Services
export { GenericUserMetadataModelService } from './services/rockets-auth-user-metadata.model.service';

// Constants
export {
  AUTH_USER_METADATA_MODULE_ENTITY_KEY,
  AuthUserMetadataModelService,
} from './constants/user-metadata.constants';

// Modules
export { RocketsAuthAdminModule } from './modules/rockets-auth-admin.module';
export { RocketsAuthSignUpModule } from './modules/rockets-auth-signup.module';
export {
  RocketsAuthUserMetadataModule,
  UserMetadataCrudService,
  ROCKETS_AUTH_USER_METADATA_ADAPTER,
} from './modules/rockets-auth-user-metadata.module';
export {
  RocketsAuthUserMetadataModuleClass,
  RocketsAuthUserMetadataOptions,
  RocketsAuthUserMetadataAsyncOptions,
  RAW_USER_METADATA_OPTIONS_TOKEN,
} from './modules/rockets-auth-user-metadata.module-definition';
