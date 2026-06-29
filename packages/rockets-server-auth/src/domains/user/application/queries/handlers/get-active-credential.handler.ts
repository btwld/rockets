import { Inject, Optional } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { UserCredentialEntityInterface } from '@concepta/nestjs-user';
import {
  RepositoryInterface,
  getDynamicRepositoryToken,
  Where,
} from '@concepta/nestjs-repository';

import { USER_CREDENTIALS_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { resolveBitwildAppContext } from '../../../../../shared/compatibility/resolve-bitwild-app-context';
import { GetActiveCredentialQuery } from '../impl/get-active-credential.query';

@QueryHandler(GetActiveCredentialQuery)
export class GetActiveCredentialHandler
  implements
    IQueryHandler<
      GetActiveCredentialQuery,
      UserCredentialEntityInterface | null
    >
{
  constructor(
    @Optional()
    @Inject(getDynamicRepositoryToken(USER_CREDENTIALS_ENTITY_KEY))
    private readonly credentialsRepo?: RepositoryInterface<UserCredentialEntityInterface>,
  ) {}

  async execute(
    query: GetActiveCredentialQuery,
  ): Promise<UserCredentialEntityInterface | null> {
    if (!this.credentialsRepo) return null;

    const ctx = resolveBitwildAppContext(query.ctx);

    return await this.credentialsRepo.findOne({
      where: Where.and(
        Where.eq<UserCredentialEntityInterface>('userId', query.userId),
        Where.eq<UserCredentialEntityInterface>('active', true),
      ),
      ctx,
    });
  }
}
