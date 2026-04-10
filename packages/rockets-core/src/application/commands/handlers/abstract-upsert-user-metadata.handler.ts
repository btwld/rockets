import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpsertUserMetadataCommand } from '../impl/upsert-user-metadata.command';
import { UserMetadataEntityInterface } from '../../../domain/interfaces/user-metadata.interface';

/**
 * Abstract base class for upsert user metadata handlers.
 *
 * Carries `@CommandHandler(UpsertUserMetadataCommand)` so subclasses inherit
 * the CQRS metadata via the prototype chain — no decorator needed
 * on the concrete class.
 *
 * To customise upsert logic, extend this class and register the
 * subclass via `RocketsModule.forRoot({ handlers: { upsertUserMetadata } })`.
 */
@CommandHandler(UpsertUserMetadataCommand)
export abstract class AbstractUpsertUserMetadataHandler
  implements
    ICommandHandler<UpsertUserMetadataCommand, UserMetadataEntityInterface>
{
  abstract execute(
    command: UpsertUserMetadataCommand,
  ): Promise<UserMetadataEntityInterface>;
}
