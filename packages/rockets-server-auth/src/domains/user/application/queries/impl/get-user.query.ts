import { ReferenceId } from '@concepta/nestjs-common';

export class GetUserQuery {
  constructor(public readonly id: ReferenceId) {}
}
