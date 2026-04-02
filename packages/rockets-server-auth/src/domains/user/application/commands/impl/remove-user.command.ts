import { RepositoryContextInterface } from '@concepta/nestjs-repository';
import { ReferenceId } from '@concepta/nestjs-common';

export class RemoveUserCommand {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly id: ReferenceId,
  ) {}
}
