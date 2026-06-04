import { ReferenceId } from '@bitwild/rockets-app';

export class GetUserQuery {
  constructor(public readonly id: ReferenceId) {}
}
