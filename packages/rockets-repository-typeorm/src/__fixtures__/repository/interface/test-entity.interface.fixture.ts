import { AuditInterface, ReferenceIdInterface } from '@bitwild/rockets-app';

export interface TestInterfaceFixture
  extends ReferenceIdInterface,
    AuditInterface {
  firstName: string;
  lastName?: string;
}
