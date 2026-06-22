import {
  ConflictException,
  Injectable,
  PlainLiteralObject,
} from '@nestjs/common';
import { type RepositoryInterface, Where } from '@bitwild/rockets-repository';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
} from '@bitwild/rockets-core';
import { PetEntity } from './pet.schema';
import { InjectDynamicRepository } from '@bitwild/rockets-common';

/**
 * Ensures `uniqueRef` is not already taken before insert.
 *
 * Runs in `beforeCreate` on the repository path so the default
 * `CrudCommandHandler` create flow stays unchanged — no custom
 * `handler:` override is required for this check.
 *
 * Thrown {@link ConflictException} is unwrapped by
 * `RocketsCoreExceptionsFilter` when nested under adapter exceptions,
 * surfacing `409` and the message to API clients.
 */
@EntityHook({ entity: PetEntity })
@Injectable()
export class PetUniqueRefHook extends PassthroughEntityHookBase<PlainLiteralObject> {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly petRepo: RepositoryInterface<PlainLiteralObject>,
  ) {
    super();
  }

  override async beforeCreate(
    payload: PlainLiteralObject,
    ctx?: EntityHookContext,
  ): Promise<PlainLiteralObject> {
    const raw = payload.uniqueRef;
    const uniqueRef = typeof raw === 'string' ? raw.trim() : undefined;

    if (!uniqueRef) {
      return payload;
    }

    const existing = await this.petRepo.findOne({
      where: Where.eq<PlainLiteralObject>('uniqueRef', uniqueRef),
      ctx,
    });

    if (existing) {
      throw new ConflictException(
        `Pet uniqueRef "${uniqueRef}" is already in use`,
      );
    }

    return payload;
  }
}
