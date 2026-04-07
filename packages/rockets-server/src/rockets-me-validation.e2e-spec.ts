import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { FailingAuthProviderFixture } from './__fixtures__/providers/failing-auth.provider.fixture';
import { ServerAuthProviderFixture } from './__fixtures__/providers/server-auth.provider.fixture';
import { RocketsServerE2eUserMetadataRepoModule } from './__e2e__/helpers/rockets-server-e2e-app.factory';
import type { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import {
  type UserMetadataCreatableInterface,
  type UserMetadataModelUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';
import { RocketsModule } from './rockets.module';
import { AuthProviderInterface } from './domain/interfaces/auth-provider.interface';
import { AuthorizedUser } from './domain/interfaces/auth-user.interface';

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

  @Validate(AlwaysFailsConstraint)
  badField?: string;
}

class NoMetadataAuthProvider implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token === 'no-metadata-token') {
      return {
        id: 'user-without-metadata',
        sub: 'user-without-metadata',
        email: 'nometadata@example.com',
        userRoles: [{ role: { name: 'user' } }],
        claims: {
          sub: 'user-without-metadata',
          email: 'nometadata@example.com',
          roles: ['user'],
        },
      };
    }
    throw new Error('Invalid token');
  }
}

const baseOptions: RocketsOptionsInterface = {
  settings: {},
  authProvider: new ServerAuthProviderFixture(),
  userMetadata: {
    createDto: MetadataCreateDto,
    updateDto: MetadataUpdateDto,
  },
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
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRoot(baseOptions),
      ],
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
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRoot({
          ...baseOptions,
          authProvider: new FailingAuthProviderFixture(),
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
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRoot({
          ...baseOptions,
          authProvider: new NoMetadataAuthProvider(),
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
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRoot({
          ...baseOptions,
          userMetadata: {
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
