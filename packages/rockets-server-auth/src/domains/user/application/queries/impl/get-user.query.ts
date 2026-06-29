import { ReferenceId } from '@concepta/nestjs-core';

export class GetUserQuery {
  constructor(public readonly id: ReferenceId) {}
}
