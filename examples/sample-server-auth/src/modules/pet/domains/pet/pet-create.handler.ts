import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CrudAdapter,
  CrudCreateCommand,
  CrudQueryException,
} from '@concepta/nestjs-crud';
import { CrudCommandHandlerBase } from '@bitwild/rockets-common';
import type { CrudCommandInterface } from '@bitwild/rockets-common';
import { getActor } from '@bitwild/rockets-core';
import { PetEntity } from './pet.entity';
import { PetCreatableInterface } from './pet.interface';
import { InjectCrudAdapter } from '@bitwild/rockets-common';

/**
 * Stamps `userId` from the authenticated actor that `ActorOverlay`
 * publishes on the CRUD context. Replaces the v7 `UseCrudLocals` flow,
 * which is broken in v8 `@bitwild/rockets-crud`
 * (`CrudLocalsInterceptor.reflectionService.getLocals` is no longer a
 * method).
 *
 * Admin-override of `userId` (previously gated on the user's roles) is
 * dropped here because the v8 `Actor` overlay only carries `{id, type}`.
 * Authorization is already enforced upstream by `AccessControlGuard`, so
 * the handler simply pins ownership to the caller.
 */
@Injectable()
export class PetCreateHandler extends CrudCommandHandlerBase<PetEntity> {
  constructor(
    @InjectCrudAdapter(PetEntity)
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
    const actor = getActor(withBody.context);
    if (!actor?.id) {
      throw new UnauthorizedException();
    }
    const dto: PetCreatableInterface = {
      ...body,
      userId: actor.id,
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
