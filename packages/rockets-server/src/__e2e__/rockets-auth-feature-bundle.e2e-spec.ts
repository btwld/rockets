import {
  Controller,
  Get,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { IsString } from 'class-validator';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import {
  AUTH_ADAPTER_TOKEN,
  defineAuthFeature,
  type AuthAdapterInterface,
  type AuthorizedUser,
  type UserMetadataCreatableInterface,
  type UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';
import {
  InjectDynamicRepository,
  type RepositoryInterface,
} from '@bitwild/rockets-repository';
import request from 'supertest';
import { RocketsModule } from '../rockets.module';
import { StubUserMetadataEntity } from '../__fixtures__/entities/stub-user-metadata.entity';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';

/**
 * Bundle subject under test. The user entity, the auth controller, and
 * the adapter all live inside the bundle — no separate `resources[]`
 * entry, no separate `auth: AuthAdapter` field. The factory is
 * zero-arg by convention (matches the sample-server pattern).
 */
@Entity('bundle_users')
class BundleUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;
}

@Injectable()
class BundleAuthAdapter implements AuthAdapterInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token === 'valid-bundle-token') {
      return {
        id: 'user-bundle',
        sub: 'user-bundle',
        email: 'bundle@test.com',
        userRoles: [{ role: { name: 'admin' } }],
        claims: {},
      };
    }
    throw new UnauthorizedException();
  }
}

@ApiTags('BundleAuth')
@Controller('bundle-auth')
class BundleAuthController {
  constructor(
    @InjectDynamicRepository('bundleUser')
    private readonly userRepo: RepositoryInterface<BundleUserEntity>,
  ) {}

  /**
   * Probe endpoint: forces DI to resolve the dynamic-repo token under the
   * key the bundle's entity claims (`bundleUser`). If the bundle's
   * `entities[]` row was not registered, this controller fails to boot
   * with a Nest DI error — exactly the regression we want this e2e to
   * catch.
   */
  @Get('probe')
  @ApiOkResponse({
    description:
      'Whether the dynamic repo for the bundle user entity is bound.',
  })
  probe(): { repoBound: boolean } {
    return { repoBound: typeof this.userRepo.find === 'function' };
  }
}

class BundleMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsString() userId!: string;
}
class BundleMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsString() id!: string;
}

function defineBundleAuth() {
  return defineAuthFeature({
    entities: [BundleUserEntity],
    adapter: BundleAuthAdapter,
    controllers: [BundleAuthController],
  });
}

describe('RocketsModule — auth: AuthFeatureBundle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [BundleUserEntity],
          synchronize: true,
          dropSchema: true,
        }),
        RocketsModule.forRoot({
          // Bundle is the ONLY auth-related field. We do NOT pass the
          // feature in `resources[]` and we do NOT pass the adapter
          // separately — the server expands the bundle.
          auth: defineBundleAuth(),
          userMetadata: {
            entity: StubUserMetadataEntity,
            createDto: BundleMetadataCreateDto,
            updateDto: BundleMetadataUpdateDto,
            // user-metadata uses the in-memory fake; the bundle's user
            // entity uses TypeORM via the root adapter.
            repository: E2eFakeRepositoryModule,
          },
          repository: TypeOrmRepositoryModule,
          resources: [],
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('expands the bundle — `AUTH_ADAPTER_TOKEN` resolves to the bundle adapter instance', () => {
    const adapter = app.get<AuthAdapterInterface>(AUTH_ADAPTER_TOKEN);
    expect(adapter).toBeInstanceOf(BundleAuthAdapter);
  });

  it('registers the bundle entity in the dynamic-repository plan (controller boots without DI errors)', async () => {
    // The probe endpoint depends on `@InjectDynamicRepository("bundleUser")`.
    // If the bundle's `entities[]` row was lost during expansion, Nest
    // would have thrown during `app.init()` — so reaching this assertion
    // already proves the registration happened. We additionally hit the
    // route to confirm the repo really is bound.
    const res = await request(app.getHttpServer())
      .get('/bundle-auth/probe')
      .set('Authorization', 'Bearer valid-bundle-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repoBound: true });
  });

  it('routes the bundle controller (proves `bundle.resource` was prepended to `resources[]`)', async () => {
    // Same controller, but now we are checking that the route exists at
    // all (no 404). 401 is acceptable too — what matters is that the
    // path is mounted by the bundle, not by us.
    const res = await request(app.getHttpServer()).get('/bundle-auth/probe');
    expect([200, 401]).toContain(res.status);
  });
});
