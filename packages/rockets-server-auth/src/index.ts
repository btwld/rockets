// Export the main module
export { RocketsServerAuthModule } from './rockets-server-auth.module';

// Export constants
export { ROCKETS_SERVER_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN as ROCKETS_SERVER_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from './rockets-server-auth.constants';

// Export configuration
export { rocketsServerAuthOptionsDefaultConfig } from './config/rockets-server-auth-options-default.config';

// Export controllers
export { AuthOAuthController } from './controllers/oauth/auth-oauth.controller';

// Export admin constants
export { ADMIN_USER_CRUD_SERVICE_TOKEN } from './rockets-server-auth.constants';

// Export admin guard
export { AdminGuard } from './guards/admin.guard';

// Export admin dynamic module
export { RocketsServerAuthAdminModule } from './modules/admin/rockets-server-auth-admin.module';

// Export admin configuration types
export type { RocketsServerAuthOptionsInterface } from './interfaces/rockets-server-auth-options.interface';
export type { RocketsServerAuthOptionsExtrasInterface } from './interfaces/rockets-server-auth-options-extras.interface';
// Export user interfaces
export type { RocketsServerAuthUserInterface } from './interfaces/user/rockets-server-auth-user.interface';
export type { RocketsServerAuthUserCreatableInterface } from './interfaces/user/rockets-server-auth-user-creatable.interface';
export type { RocketsServerAuthUserUpdatableInterface } from './interfaces/user/rockets-server-auth-user-updatable.interface';
export type { RocketsServerAuthUserEntityInterface } from './interfaces/user/rockets-server-auth-user-entity.interface';

// Export Swagger generator
export { generateSwaggerJson } from './generate-swagger';
// Export DTOs
export { RocketsServerAuthJwtResponseDto } from './dto/auth/rockets-server-auth-jwt-response.dto';
export { RocketsServerAuthLoginDto } from './dto/auth/rockets-server-auth-login.dto';
export { RocketsServerAuthRefreshDto } from './dto/auth/rockets-server-auth-refresh.dto';
export { RocketsServerAuthRecoverLoginDto } from './dto/auth/rockets-server-auth-recover-login.dto';
export { RocketsServerAuthRecoverPasswordDto } from './dto/auth/rockets-server-auth-recover-password.dto';
export { RocketsServerAuthUserCreateDto } from './dto/user/rockets-server-auth-user-create.dto';
export { RocketsServerAuthUserUpdateDto } from './dto/user/rockets-server-auth-user-update.dto';
export { RocketsServerAuthUserDto } from './dto/user/rockets-server-auth-user.dto';
