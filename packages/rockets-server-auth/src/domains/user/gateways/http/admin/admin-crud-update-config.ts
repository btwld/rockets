import { UserCrudOptionsExtrasInterface } from '../../../../../shared/interfaces/rockets-auth-options-extras.interface';

/**
 * Injectable config holder for admin update handler.
 * Passes the userMetadataConfig from module registration to the handler.
 */
export class AdminUserUpdateConfig {
  constructor(
    public readonly userMetadataConfig?: UserCrudOptionsExtrasInterface['userMetadataConfig'],
  ) {}
}
