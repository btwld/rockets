// Export configuration types
export type { RocketsServerOptionsInterface } from './interfaces/rockets-server-options.interface';
export type { RocketsServerOptionsExtrasInterface } from './interfaces/rockets-server-options-extras.interface';

// Export auth components
export { AuthGuard } from './guards/auth.guard';
export { AuthProviderInterface } from './interfaces/auth-provider.interface';
export { AuthorizedUser } from './interfaces/auth-user.interface';

// Export main module
export { RocketsServerModule } from './rockets-server.module';