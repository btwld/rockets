import type { PlainLiteralObject } from '@nestjs/common';
import { Command } from '@nestjs/cqrs';
import type { Invitation } from '@concepta/nestjs-invitation';

/**
 * Accept an invitation and onboard the invited account as ONE unit of work.
 *
 * Upstream's `AcceptInvitationCommand` commits the acceptance on its own and
 * announces it with a post-commit `InvitationAcceptedEvent`; onboarding that
 * reacts to the event runs outside the acceptance transaction, so a failure
 * there leaves the invitation burned and the account inactive. This command
 * opens the scope both share instead — upstream's own `txScope.run` joins it
 * rather than committing — so onboarding failures roll the acceptance back
 * and the invitee can try again.
 *
 * Resolves `null` when the passcode does not match, matching upstream.
 *
 * `TransactionScope.run` fails OPEN: with no transaction factory registered
 * for the store behind these entities, it runs the body unprotected and
 * nothing warns (AGENTS.md rule 16). On such an adapter this degrades to
 * "500 instead of 200, invitation still burned" — the TypeORM and Firestore
 * adapters both contribute factories, so the shipped configurations are
 * covered.
 */
export class RocketsAcceptInvitationCommand extends Command<Invitation | null> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly code: string,
    public readonly dto: {
      readonly passcode: string;
      readonly payload?: PlainLiteralObject;
    },
  ) {
    super();
  }
}
