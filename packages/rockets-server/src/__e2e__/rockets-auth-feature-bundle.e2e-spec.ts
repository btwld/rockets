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
import { TypeOrmRepositoryModule } from '@bitwild/rockets-repository-typeorm';
import {
  AUTH_ADAPTERS_TOKEN,
  defineModuleResource,
  extractBearerToken,
  type AuthAdapterInterface,
  type AuthAttemptResult,
  type AuthBootstrap,
  type AuthRequest,
  type UserMetadataCreatableInterface,
  type UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';
import {
  InjectDynamicRepository,
  type RepositoryInterface,
} from '@bitwild/rockets-core';
import request from 'supertest';
import { RocketsModule } from '../rockets.module';
import { StubUserMetadataEntity } from '../__fixtures__/entities/stub-user-metadata.entity';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';

@Entity('bundle_users')
class BundleUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;
}

@Injectable()
class BundleAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'valid-bundle-token') {
      return {
        matched: true,
        user: {
          id: 'user-bundle',
          sub: 'user-bundle',
          email: 'bundle@test.com',
          userRoles: [{ role: { name: 'admin' } }],
          claims: {},
        },
      };
    }
    return { matched: true, error: new UnauthorizedException() };
  }
}

@ApiTags('BundleAuth')
@Controller('bundle-auth')
class BundleAuthController {
  constructor(
    @InjectDynamicRepository('bundleUser')
    private readonly userRepo: RepositoryInterface<BundleUserEntity>,
  ) {}

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

const bundleAuthResource = defineModuleResource({
  entities: [BundleUserEntity],
});

function defineBundleAuth(): AuthBootstrap {
  return {
    adapter: BundleAuthAdapter,
    forRoot: () => ({
      module: class BundleAuthHostModule {},
      providers: [BundleAuthAdapter],
      controllers: [BundleAuthController],
      exports: [BundleAuthAdapter],
    }),
  };
}

describe('RocketsModule — auth: AuthBootstrap (e2e)', () => {
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
          auth: defineBundleAuth(),
          userMetadata: {
            entity: StubUserMetadataEntity,
            createDto: BundleMetadataCreateDto,
            updateDto: BundleMetadataUpdateDto,
            repository: E2eFakeRepositoryModule,
          },
          repository: TypeOrmRepositoryModule,
          resources: [bundleAuthResource],
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('resolves AUTH_ADAPTERS_TOKEN with the bootstrap adapter instance', () => {
    const adapters = app.get<AuthAdapterInterface[]>(AUTH_ADAPTERS_TOKEN);
    expect(adapters).toBeDefined();
    expect(adapters.some((a) => a instanceof BundleAuthAdapter)).toBe(true);
  });

  it('registers the entity row and binds the dynamic repo', async () => {
    const res = await request(app.getHttpServer())
      .get('/bundle-auth/probe')
      .set('Authorization', 'Bearer valid-bundle-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repoBound: true });
  });

  it('mounts the controller from the bootstrap forRoot module', async () => {
    const res = await request(app.getHttpServer()).get('/bundle-auth/probe');
    expect([200, 401]).toContain(res.status);
  });
});
