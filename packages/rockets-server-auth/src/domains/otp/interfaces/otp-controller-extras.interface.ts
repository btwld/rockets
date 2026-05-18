import {
  RocketsAuthControllerExtrasBase,
  RocketsAuthRouteExtrasBase,
} from '../../../shared/interfaces/controller/rockets-auth-controller-extras.interface';

export interface OtpRouteExtras extends RocketsAuthRouteExtrasBase {}

export interface OtpRoutesMap {
  send?: OtpRouteExtras;
  confirm?: OtpRouteExtras;
}

export interface OtpControllerExtras
  extends RocketsAuthControllerExtrasBase<OtpRoutesMap> {}
