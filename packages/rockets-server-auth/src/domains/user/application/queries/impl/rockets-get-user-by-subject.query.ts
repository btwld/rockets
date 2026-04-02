import { ReferenceSubject } from '@concepta/nestjs-common';

export class RocketsGetUserBySubjectQuery {
  constructor(public readonly subject: ReferenceSubject) {}
}
