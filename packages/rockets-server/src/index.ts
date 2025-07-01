// Export the main module
export { RocketsServerModule } from './rockets-server.module';

// Export constants
export { ROCKETS_SERVER_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from './rockets-server.constants';

// Export configuration
export { authenticationOptionsDefaultConfig } from './config/rockets-server-options-default.config';

// Export controllers
export { AuthOAuthController } from './controllers/oauth/auth-oauth.controller';

// Export Swagger generator
export { generateSwaggerJson } from './generate-swagger';
