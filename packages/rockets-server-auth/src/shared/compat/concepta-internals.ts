/**
 * Compatibility re-exports for `@concepta` symbols not currently exposed
 * by package root entry points.
 *
 * Keep all deep `/dist` imports centralized here to minimize churn when
 * upstream packages expose stable root exports.
 */

export { CrudRelations } from '@concepta/nestjs-crud/dist/crud/decorators/routes/crud-relations.decorator';
export type { CrudModuleOptionsInterface } from '@concepta/nestjs-crud/dist/interfaces/crud-module-options.interface';

export type { RoleOptionsExtrasInterface } from '@concepta/nestjs-role/dist/interfaces/role-options-extras.interface';
export type { RoleOptionsInterface } from '@concepta/nestjs-role/dist/interfaces/role-options.interface';

export type { FederatedOptionsInterface } from '@concepta/nestjs-federated/dist/interfaces/federated-options.interface';

export type { UserOptionsInterface } from '@concepta/nestjs-user/dist/interfaces/user-options.interface';
export type { UserPasswordHistoryServiceInterface } from '@concepta/nestjs-user/dist/interfaces/user-password-history-service.interface';

export { InvitationAttemptService } from '@concepta/nestjs-invitation/dist/services/invitation-attempt.service';
export { InvitationAcceptInviteDto } from '@concepta/nestjs-invitation/dist/dto/invitation-accept-invite.dto';
export { InvitationCreateInviteDto } from '@concepta/nestjs-invitation/dist/dto/invitation-create-invite.dto';
export { InvitationDto } from '@concepta/nestjs-invitation/dist/dto/invitation.dto';
export type { InvitationOptionsInterface } from '@concepta/nestjs-invitation/dist/interfaces/options/invitation-options.interface';
export type { InvitationSettingsInterface } from '@concepta/nestjs-invitation/dist/interfaces/options/invitation-settings.interface';

export type { AuthVerifyNotificationServiceInterface } from '@concepta/nestjs-auth-verify/dist/interfaces/auth-verify-notification.service.interface';
export { AuthRefreshStrategy } from '@concepta/nestjs-auth-refresh/dist/auth-refresh.strategy';
