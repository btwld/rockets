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
} from '@bitwild/rockets-repository';
import request from 'supertest';
import { RocketsModule } from '../rockets.module';
import { StubUserMetadataEntity } from '../__fixtures__/entities/stub-user-metadata.entity';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';

@Entity('integration_users')
class IntegrationUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;
}

@Injectable()
class IntegrationAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'valid-integration-token') {
      return {
        matched: true,
        user: {
          id: 'user-integration',
          sub: 'user-integration',
          email: 'integration@test.com',
          userRoles: [{ role: { name: 'admin' } }],
          claims: {},
        },
      };
    }
    return { matched: true, error: new UnauthorizedException() };
  }
}

@ApiTags('IntegrationAuth')
@Controller('integration-auth')
class IntegrationAuthController {
  constructor(
    @InjectDynamicRepository('integrationUser')
    private readonly userRepo: RepositoryInterface<IntegrationUserEntity>,
  ) {}

  @Get('probe')
  @ApiOkResponse({
    description:
      'Whether the dynamic repo for the integration user entity is bound.',
  })
  probe(): { repoBound: boolean } {
    return { repoBound: typeof this.userRepo.find === 'function' };
  }
}

class IntegrationMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsString() userId!: string;
}
class IntegrationMetadataUpdateDto
  implements UserMetadataModelUpdatableInterface
{
  @IsString() id!: string;
}

function buildAuthBootstrap(): AuthBootstrap {
  return {
    adapter: IntegrationAuthAdapter,
    forRoot: () => ({
      module: class IntegrationAuthHostModule {},
      providers: [IntegrationAuthAdapter],
      exports: [IntegrationAuthAdapter],
    }),
  };
}

const integrationUserMetadata = {
  entity: StubUserMetadataEntity,
  createDto: IntegrationMetadataCreateDto,
  updateDto: IntegrationMetadataUpdateDto,
  repository: E2eFakeRepositoryModule,
};

describe('RocketsModule — auth: AuthBootstrap (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [IntegrationUserEntity],
          synchronize: true,
          dropSchema: true,
        }),
        RocketsModule.forRoot({
          auth: buildAuthBootstrap(),
          userMetadata: integrationUserMetadata,
          repository: TypeOrmRepositoryModule,
          resources: [
            defineModuleResource({
              entities: [IntegrationUserEntity],
              controllers: [IntegrationAuthController],
            }),
          ],
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('resolves AUTH_ADAPTERS_TOKEN and contains the integration adapter instance', () => {
    const adapters = app.get<AuthAdapterInterface[]>(AUTH_ADAPTERS_TOKEN);
    expect(adapters).toBeDefined();
    expect(adapters.some((a) => a instanceof IntegrationAuthAdapter)).toBe(
      true,
    );
  });

  it('registers module-resource entities (repo probe returns 200)', async () => {
    const res = await request(app.getHttpServer())
      .get('/integration-auth/probe')
      .set('Authorization', 'Bearer valid-integration-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repoBound: true });
  });

  it('mounts the controller from the module resource', async () => {
    const res = await request(app.getHttpServer()).get(
      '/integration-auth/probe',
    );
    expect([200, 401]).toContain(res.status);
  });
});
