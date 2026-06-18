import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { RocketsModule, defineTypeOrmRepository } from '@bitwild/rockets';
import type { ResourceInput } from '@bitwild/rockets';
import {
  UserMetadataCreateDto,
  UserMetadataEntity,
  UserMetadataUpdateDto,
} from '../src/user-metadata.schema';
import { defineSampleAuth, sampleAuthUserResource } from '../src/auth';
import { tagResource } from './__fixtures__/tag-classic-control';
import { tagZodResource } from '../src/resources/tag/tag.zod';

/**
 * Golden Swagger test for the zod (nestjs-zod) tag resource.
 *
 * Boots two symmetric apps — one registering the handwritten
 * `tagResource` (control), one registering the zod-driven
 * `tagZodResource` (nestjs-zod `createZodDto` + `cleanupOpenApiDoc`) —
 * and compares the OpenAPI documents:
 *
 * 1. The `/tags` paths must be deep-equal (routes, params, $refs,
 *    security — the wire contract is identical).
 * 2. Handwritten Response/Create schemas must be subsets of the zod
 *    schemas (nothing the handwritten DTOs documented may be lost) —
 *    the zod output is intentionally RICHER (minLength/maxLength and
 *    format `pattern`s surface because zod knows them structurally).
 * 3. The update DTO diverges on purpose: the handwritten idiom keeps
 *    the pk `required` in docs while accepting its absence at runtime;
 *    nestjs-zod has no docs-vs-runtime split, so the pk is honestly
 *    optional (the id arrives via the URL param).
 */
describe('zod → DTO Swagger golden (e2e)', () => {
  let controlDoc: OpenAPIObject;
  let zodDoc: OpenAPIObject;

  async function createDocument(tag: ResourceInput): Promise<OpenAPIObject> {
    @Module({
      imports: [
        RocketsModule.forRoot({
          auth: defineSampleAuth(),
          userMetadata: {
            entity: UserMetadataEntity,
            createDto: UserMetadataCreateDto,
            updateDto: UserMetadataUpdateDto,
          },
          repository: defineTypeOrmRepository({
            type: 'sqlite',
            database: ':memory:',
            synchronize: true,
            dropSchema: true,
          }),
          resources: [sampleAuthUserResource, tag],
        }),
      ],
    })
    class GoldenModule {}

    const app: INestApplication = await NestFactory.create(GoldenModule, {
      logger: ['error'],
    });
    await app.init();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('golden')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    await app.close();
    // No-op for documents without nestjs-zod DTOs (the control app);
    // required for the zod app — same call main.ts makes.
    return cleanupOpenApiDoc(document);
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function schemaOf(
    doc: OpenAPIObject,
    name: string,
  ): Record<string, unknown> {
    const schema: unknown = doc.components?.schemas?.[name];
    if (!isRecord(schema)) {
      throw new Error(`Schema "${name}" missing from document components`);
    }
    return schema;
  }

  beforeAll(async () => {
    controlDoc = await createDocument(tagResource);
    zodDoc = await createDocument(tagZodResource);
  }, 60000);

  it('exposes identical /tags paths (wire contract parity)', () => {
    expect(zodDoc.paths['/tags']).toBeDefined();
    expect(zodDoc.paths['/tags/{id}']).toBeDefined();
    expect(zodDoc.paths['/tags']).toEqual(controlDoc.paths['/tags']);
    expect(zodDoc.paths['/tags/{id}']).toEqual(controlDoc.paths['/tags/{id}']);
  });

  it.each(['TagResponseDto', 'TagCreateDto'])(
    '%s: handwritten schema is a subset of the compiled schema',
    (name) => {
      expect(schemaOf(zodDoc, name)).toMatchObject(schemaOf(controlDoc, name));
    },
  );

  it('TagResponseDto: exact compiled schema', () => {
    expect(schemaOf(zodDoc, 'TagResponseDto')).toEqual({
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          pattern: expect.any(String),
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          example: 'vaccinated',
        },
        color: { type: 'string', maxLength: 20, example: '#ff0000' },
        dateCreated: {
          type: 'string',
          format: 'date-time',
          pattern: expect.any(String),
        },
        dateUpdated: {
          type: 'string',
          format: 'date-time',
          pattern: expect.any(String),
        },
      },
      required: ['id', 'name', 'dateCreated', 'dateUpdated'],
    });
  });

  it('TagCreateDto: exact compiled schema (generated fields excluded)', () => {
    expect(schemaOf(zodDoc, 'TagCreateDto')).toEqual({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          example: 'vaccinated',
        },
        color: { type: 'string', maxLength: 20, example: '#ff0000' },
      },
      required: ['name'],
    });
  });

  it('TagUpdateDto: exact compiled schema (everything optional — id comes from the URL)', () => {
    expect(schemaOf(zodDoc, 'TagUpdateDto')).toEqual({
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          pattern: expect.any(String),
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          example: 'vaccinated',
        },
        color: { type: 'string', maxLength: 20, example: '#ff0000' },
      },
    });
    // Divergence from the handwritten control, on purpose: nestjs-zod
    // has no docs-vs-runtime split, so the pk cannot be "required in
    // docs, lenient at runtime" — it is honestly optional.
    expect(schemaOf(controlDoc, 'TagUpdateDto').required).toEqual(['id']);
  });
});
