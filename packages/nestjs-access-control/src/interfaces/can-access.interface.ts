import { AccessControlContextInterface } from './access-control-context.interface';

export interface CanAccess {
  canAccess(context: AccessControlContextInterface): Promise<boolean>;
}
