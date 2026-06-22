import { DomainAggregate } from '@concepta/nestjs-core/aggregate';
import { UserEntityInterface, UserInterface } from '@concepta/nestjs-user';

/**
 * Maps a v8 user aggregate to the entity-shape interface consumers expect.
 *
 * `DomainAggregate<UserInterface>.toPlain()` already returns a shape that
 * satisfies `UserEntityInterface`, including aggregate metadata and audit
 * fields. No cast is needed; TypeScript infers the assignment directly.
 */
export function userAggregateToEntity(
  aggregate: DomainAggregate<UserInterface>,
): UserEntityInterface {
  return aggregate.toPlain();
}
