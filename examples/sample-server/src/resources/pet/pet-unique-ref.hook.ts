import { ConflictException, PlainLiteralObject } from '@nestjs/common';
import { Where } from '@bitwild/rockets-repository';
import { defineHook } from '@bitwild/rockets-core';
import { PetEntity } from './pet.schema';

/**
 * Functional hook (via {@link defineHook}) — the same `beforeCreate`
 * uniqueness check that used to be a hand-written `PassthroughEntityHookBase`
 * subclass. `tools.repo` is the pet repository, injected by the generator;
 * no `@EntityHook` / `@Injectable` / `@InjectDynamicRepository` boilerplate.
 *
 * Thrown {@link ConflictException} is unwrapped by `RocketsCoreExceptionsFilter`,
 * surfacing `409` to API clients.
 */
export const PetUniqueRefHook = defineHook<PlainLiteralObject>(PetEntity, {
  async beforeCreate(payload, ctx, { repo }) {
    const raw = payload.uniqueRef;
    const uniqueRef = typeof raw === 'string' ? raw.trim() : undefined;
    if (!uniqueRef) {
      return payload;
    }

    const existing = await repo.findOne({
      where: Where.eq<PlainLiteralObject>('uniqueRef', uniqueRef),
      ctx,
    });
    if (existing) {
      throw new ConflictException(
        `Pet uniqueRef "${uniqueRef}" is already in use`,
      );
    }

    return payload;
  },
});
