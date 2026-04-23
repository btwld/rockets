import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CrudAdapter,
  CrudCreateCommand,
  CrudQueryException,
  InjectCrudAdapter,
} from '@bitwild/rockets-crud';
import { getLocal } from '../../utils/get-local.helper';
// TODO: deep imports — move to barrel when @concepta/nestjs-crud exports these
import { CrudCommandHandler } from '@concepta/nestjs-crud/dist/application/commands/handlers/crud-command.handler';
import type { CrudCommandInterface } from '@concepta/nestjs-crud/dist/application/commands/interfaces/crud-command.interface';
import { PET_MODULE_PET_ENTITY_KEY } from '../../constants/pet.constants';
import { PetEntity } from './pet.entity';
import { PetCreatableInterface } from './pet.interface';
import { AppRole } from '../../../../app.acl';
import {
  JwtAuthenticatedUserLocal,
  JwtAuthenticatedUserPayload,
} from '../../jwt-authenticated-user.local';

/**
 * Sets `userId` from CRUD locals (JWT user). Elevated roles may set `userId` from the body;
 * others always own the created pet.
 */
@Injectable()
export class PetCreateHandler extends CrudCommandHandler<PetEntity> {
  constructor(
    @InjectCrudAdapter(PET_MODULE_PET_ENTITY_KEY)
    crudAdapter: CrudAdapter<PetEntity>,
  ) {
    super(crudAdapter);
  }

  async execute(command: CrudCommandInterface<PetEntity>): Promise<PetEntity> {
    const withBody = command as CrudCreateCommand<
      PetEntity,
      PetCreatableInterface
    >;
    const body = withBody.dto as PetCreatableInterface;
    const authUser = getLocal<JwtAuthenticatedUserPayload>(
      withBody.context,
      JwtAuthenticatedUserLocal,
    );
    if (!authUser?.id) {
      throw new UnauthorizedException();
    }
    const roleNames = authUser.userRoles.map(
      (ur: { role: { name: string } }) => ur.role.name,
    );
    const isElevated =
      roleNames.includes(AppRole.Admin) || roleNames.includes(AppRole.Manager);
    const userId = isElevated && body.userId ? body.userId : authUser.id;
    const dto: PetCreatableInterface = {
      ...body,
      userId,
    };
    try {
      return await this.crudAdapter.create(withBody.context, dto);
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new CrudQueryException(this.crudAdapter.entityName(), {
        originalError: e,
      });
    }
  }
}
