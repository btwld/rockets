import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { FailingAuthAdapterFixture } from './__fixtures__/providers/failing-auth.adapter.fixture';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import type { RocketsOptions } from './rockets.module-definition';
import { StubUserMetadataEntity } from './__fixtures__/entities/stub-user-metadata.entity';
import {
  type UserMetadataCreatableInterface,
  type UserMetadataModelUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';
import { RocketsModule } from './rockets.module';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@bitwild/rockets-core';
import { extractBearerToken } from '@bitwild/rockets-core';
import { e2eAuthBootstrap } from './__fixtures__/providers/e2e-auth-bootstrap.fixture';

class MetadataCreateDto implements UserMetadataCreatableInterface {
  @IsNotEmpty()
  @IsString()
  userId!: string;
}

class MetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @IsEmail()
  notifyEmail?: string;
}

@ValidatorConstraint({ name: 'alwaysFails', async: false })
class AlwaysFailsConstraint implements ValidatorConstraintInterface {
  validate(): boolean {
    return false;
  }
}

class MetadataUpdateNullConstraintsDto
  implements UserMetadataModelUpdatableInterface
{
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @Validate(AlwaysFailsConstraint)
  badField?: string;
}

class NoMetadataAuthProvider implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };

    if (token === 'no-metadata-token') {
      return {
        matched: true,
        user: {
          id: 'user-without-metadata',
          sub: 'user-without-metadata',
          email: 'nometadata@example.com',
          userRoles: [{ role: { name: 'user' } }],
          claims: {
            sub: 'user-without-metadata',
            email: 'nometadata@example.com',
            roles: ['user'],
          },
        },
      };
    }
    throw new Error('Invalid token');
  }
}

const baseOptions: RocketsOptions = {
  settings: {},
  auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
  userMetadata: {
    entity: StubUserMetadataEntity,
    createDto: MetadataCreateDto,
    updateDto: MetadataUpdateDto,
  },
  repository: E2eFakeRepositoryModule,
};

describe('MeController contract (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('PATCH /me returns 400 when dynamic userMetadata fails class-validator', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RocketsModule.forRoot(baseOptions)],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({
        userMetadata: {
          notifyEmail: 'not-a-valid-email',
        },
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(
      Array.isArray(res.body.message) || typeof res.body.message === 'string',
    ).toBe(true);
  });

  it('GET /me returns 401 when auth provider rejects token', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRoot({
          ...baseOptions,
          auth: e2eAuthBootstrap(FailingAuthAdapterFixture),
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer any-token')
      .expect(401);
  });

  it('GET /me returns empty userMetadata object when user has no metadata', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRoot({
          ...baseOptions,
          auth: e2eAuthBootstrap(NoMetadataAuthProvider),
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer no-metadata-token')
      .expect(200);

    expect(res.body).toMatchObject({
      id: 'user-without-metadata',
      sub: 'user-without-metadata',
      email: 'nometadata@example.com',
    });
    expect(res.body.userMetadata).toEqual({});
  });

  it('PATCH /me returns 400 with empty messages array when validation error has null constraints', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRoot({
          ...baseOptions,
          userMetadata: {
            entity: StubUserMetadataEntity,
            createDto: MetadataCreateDto,
            updateDto: MetadataUpdateNullConstraintsDto,
          },
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({
        userMetadata: {
          badField: 'any-value',
        },
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });
});
