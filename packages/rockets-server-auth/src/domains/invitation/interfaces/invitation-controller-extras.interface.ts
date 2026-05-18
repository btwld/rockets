import {
  RocketsAuthControllerExtrasBase,
  RocketsAuthRouteExtrasBase,
} from '../../../shared/interfaces/controller/rockets-auth-controller-extras.interface';

export interface InvitationRouteExtras extends RocketsAuthRouteExtrasBase {}

/** `admin/invitations` create/send. */
export interface InvitationControllerExtras
  extends RocketsAuthControllerExtrasBase<{
    create?: InvitationRouteExtras;
  }> {}

/** `invitation-acceptance/:code`. */
export interface InvitationAcceptanceControllerExtras
  extends RocketsAuthControllerExtrasBase<{
    accept?: InvitationRouteExtras;
  }> {}

/** `admin/invitations/revoke`. */
export interface InvitationRevocationControllerExtras
  extends RocketsAuthControllerExtrasBase<{
    revoke?: InvitationRouteExtras;
  }> {}

/** `admin/invitations/:code/reattempt`. */
export interface InvitationReattemptControllerExtras
  extends RocketsAuthControllerExtrasBase<{
    reattempt?: InvitationRouteExtras;
  }> {}

export interface InvitationDomainControllerExtras {
  invitation?: InvitationControllerExtras;
  acceptance?: InvitationAcceptanceControllerExtras;
  revocation?: InvitationRevocationControllerExtras;
  reattempt?: InvitationReattemptControllerExtras;
}
