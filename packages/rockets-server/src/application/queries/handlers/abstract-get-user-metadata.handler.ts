import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetUserMetadataQuery } from '../impl/get-user-metadata.query';
import { UserMetadataEntityInterface } from '../../../domain/interfaces/user-metadata.interface';

/**
 * Abstract base class for get user metadata handlers.
 *
 * Carries `@QueryHandler(GetUserMetadataQuery)` so subclasses inherit
 * the CQRS metadata via the prototype chain — no decorator needed
 * on the concrete class.
 *
 * To customise get logic, extend this class and register the
 * subclass via `RocketsModule.forRoot({ handlers: { getUserMetadata } })`.
 */
@QueryHandler(GetUserMetadataQuery)
export abstract class AbstractGetUserMetadataHandler
  implements
    IQueryHandler<GetUserMetadataQuery, UserMetadataEntityInterface | null>
{
  abstract execute(
    query: GetUserMetadataQuery,
  ): Promise<UserMetadataEntityInterface | null>;
}
