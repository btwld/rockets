import { afterEach, describe, expect, it } from 'vitest';
import { INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import type { UserMetadataEntityInterface } from '../domain/interfaces/user-metadata.interface';
import { RocketsCoreModule } from '../rockets-core.module';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import { AbstractUpsertUserMetadataHandler } from '../application/commands/handlers/abstract-upsert-user-metadata.handler';
import { AbstractGetUserMetadataHandler } from '../application/queries/handlers/abstract-get-user-metadata.handler';
import { UpsertUserMetadataCommand } from '../application/commands/impl/upsert-user-metadata.command';
import { GetUserMetadataQuery } from '../application/queries/impl/get-user-metadata.query';

@Injectable()
class GateAuthAdapter implements AuthAdapterInterface {
  async authenticate(_request: AuthRequest): Promise<AuthAttemptResult> {
    return { matched: false };
  }
}

function metadataFor(userId: string): UserMetadataEntityInterface {
  return {
    id: userId,
    userId,
    dateCreated: new Date(0),
    dateUpdated: new Date(0),
    dateDeleted: null,
    version: 1,
  };
}

/**
 * Stores metadata in memory so it depends on nothing the planner registers.
 * The built-in handlers inject the user-metadata dynamic repository, which is
 * only registered when `userMetadata` is configured.
 */
@Injectable()
class InMemoryUpsertHandler extends AbstractUpsertUserMetadataHandler {
  async execute(
    command: UpsertUserMetadataCommand,
  ): Promise<UserMetadataEntityInterface> {
    return metadataFor(command.userId);
  }
}

@Injectable()
class InMemoryGetHandler extends AbstractGetUserMetadataHandler {
  async execute(
    query: GetUserMetadataQuery,
  ): Promise<UserMetadataEntityInterface | null> {
    return metadataFor(query.userId);
  }
}

async function bootWithHandlers(
  handlers: Parameters<typeof RocketsCoreModule.forRoot>[0]['handlers'],
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      RocketsCoreModule.forRoot({
        auth: defineAuthAdapter(GateAuthAdapter),
        handlers,
        global: true,
      }),
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('RocketsCoreModule — user-metadata handler gate (e2e)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('boots with no metadata contract and no handlers at all', async () => {
    app = await bootWithHandlers(undefined);

    expect(app).toBeDefined();
  });

  it('boots when only the upsert handler is overridden', async () => {
    // The default GetUserMetadataHandler must NOT be pulled in here: it injects
    // the user-metadata dynamic repository, which is unregistered without a
    // `userMetadata` contract, and Nest would fail to resolve it at init.
    app = await bootWithHandlers({ upsertUserMetadata: InMemoryUpsertHandler });

    const result = await app
      .get(CommandBus)
      .execute(new UpsertUserMetadataCommand({}, 'user-1', {}));

    expect(result).toEqual(metadataFor('user-1'));
  });

  it('boots when only the get handler is overridden', async () => {
    app = await bootWithHandlers({ getUserMetadata: InMemoryGetHandler });

    const result = await app
      .get(QueryBus)
      .execute(new GetUserMetadataQuery({}, 'user-2'));

    expect(result).toEqual(metadataFor('user-2'));
  });
});
