import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication, Module } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import {
  ExceptionsFilter,
  RocketsModule,
} from '@concepta/rockets';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';
import { userMetadataConfig } from '../src/user-metadata.schema';
import { defineSampleAuth, sampleAuthUserResource } from '../src/auth';
import { createSampleServerOpenApiDocument } from '../src/swagger/create-openapi-document';
import {
  authorZodResource,
  bookZodResource,
} from '../src/resources/library';

/**
 * Library pair (`authorZodResource` / `bookZodResource`) end to end:
 * - `dto` field roles (create-only `isbn`, write-only `internalNote`)
 * - a `relation` FK (`authorId` → author) compiled into the generated
 *   entity (ManyToOne + JoinColumn + eager) and exposed in the response
 *   document as a nested object
 * - keyed operations: soft delete, restore, replace
 *
 * Both the OpenAPI document and the runtime behaviour are asserted.
 */
describe('library zod resources (e2e)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;
  let token: string;

  beforeAll(async () => {
    @Module({
      imports: [
        RocketsModule.forRoot({
          auth: defineSampleAuth(),
          userMetadata: userMetadataConfig,
          repository: defineTypeOrmRepository({
            type: 'sqlite',
            database: ':memory:',
            synchronize: true,
            dropSchema: true,
          }),
          resources: [sampleAuthUserResource, authorZodResource, bookZodResource],
        }),
      ],
    })
    class LibraryModule {}

    app = await NestFactory.create(LibraryModule, { logger: ['error'] });
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();

    // Through the app's own builder so the Rockets converter turns every
    // named schema into a `$ref`'d component — the document main.ts serves.
    doc = createSampleServerOpenApiDocument(app);

    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'library@example.com',
        password: 'password123',
        name: 'Library Tester',
      })
      .expect(201);
    token = signup.body.accessToken as string;
  }, 120000);

  afterAll(async () => {
    await app?.close();
  });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function schemaOf(name: string): Record<string, unknown> {
    const schema: unknown = doc.components?.schemas?.[name];
    if (!isRecord(schema)) {
      throw new Error(`Schema "${name}" missing from document components`);
    }
    return schema;
  }

  /**
   * Generated CRUD request bodies are `$ref`'d to their named component
   * (`Book*Dto`) like every response — Rockets drops upstream's inline
   * `ApiBody` stamp (conceptadev/nestjs-modules#467) — so the request-side
   * field roles are read off the component the operation points at.
   */
  function requestBodyOf(
    path: string,
    method: 'post' | 'patch' | 'put',
  ): Record<string, unknown> {
    const operation: unknown = doc.paths[path]?.[method];
    if (!isRecord(operation) || !isRecord(operation.requestBody)) {
      throw new Error(`${method.toUpperCase()} ${path} has no request body`);
    }
    const content = operation.requestBody.content;
    const json = isRecord(content) ? content['application/json'] : undefined;
    const schema = isRecord(json) ? json.schema : undefined;
    if (!isRecord(schema) || typeof schema.$ref !== 'string') {
      throw new Error(`${method.toUpperCase()} ${path} body is not a $ref`);
    }
    return schemaOf(schema.$ref.replace('#/components/schemas/', ''));
  }

  describe('OpenAPI document', () => {
    it.each([
      '/authors',
      '/authors/{id}',
      '/books',
      '/books/{id}',
      '/books/restore/{id}',
    ])('%s path is documented', (path) => {
      expect(doc.paths[path]).toBeDefined();
    });

    it.each(['AuthorResponseDto', 'BookResponseDto'])(
      '%s component is emitted',
      (name) => {
        expect(schemaOf(name).properties).toBeDefined();
      },
    );

    it.each([
      ['/authors', 'post'],
      ['/books', 'post'],
      ['/books/{id}', 'patch'],
      ['/books/{id}', 'put'],
    ] as const)('%s %s documents its request body', (path, method) => {
      expect(requestBodyOf(path, method).properties).toBeDefined();
    });

    it('the update body excludes the create-only isbn; replace keeps it', () => {
      expect(requestBodyOf('/books/{id}', 'patch').properties).not.toHaveProperty(
        'isbn',
      );
      expect(requestBodyOf('/books/{id}', 'put').properties).toHaveProperty(
        'isbn',
      );
    });

    it('BookResponseDto excludes the write-only internalNote; the create body keeps it', () => {
      expect(schemaOf('BookResponseDto').properties).not.toHaveProperty(
        'internalNote',
      );
      expect(requestBodyOf('/books', 'post').properties).toHaveProperty(
        'internalNote',
      );
    });

    it('BookResponseDto exposes the nested author projection as a named component', () => {
      const properties = schemaOf('BookResponseDto').properties as Record<
        string,
        Record<string, unknown>
      >;
      // Single nested object: the bridge emits the `$ref` wrapped in `allOf`.
      expect(properties.author).toEqual({
        allOf: [{ $ref: '#/components/schemas/BookAuthorResponseDto' }],
      });
      const nested = schemaOf('BookAuthorResponseDto').properties as Record<
        string,
        Record<string, unknown>
      >;
      expect(Object.keys(nested).sort()).toEqual([
        'dateCreated',
        'dateUpdated',
        'id',
        'name',
      ]);
      expect(nested.dateCreated).toEqual({
        type: 'string',
        format: 'date-time',
      });
    });

    it('response components are fail-closed (additionalProperties: false)', () => {
      expect(schemaOf('BookResponseDto').additionalProperties).toBe(false);
      expect(schemaOf('AuthorResponseDto').additionalProperties).toBe(false);
    });

    it('the paginated list references the named paginated component', () => {
      const list = doc.paths['/books'].get?.responses['200'] as {
        content: Record<string, { schema: unknown }>;
      };
      expect(list.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/BookResponseDtoPaginatedDto',
      });
      const items = (
        schemaOf('BookResponseDtoPaginatedDto').properties as Record<
          string,
          Record<string, unknown>
        >
      ).data;
      expect(items).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/BookResponseDto' },
      });
    });

    it('zod field meta namespaces do not leak into the document', () => {
      const raw = JSON.stringify(doc.components?.schemas);
      expect(raw).not.toContain('"db"');
      expect(raw).not.toContain('"dto"');
      expect(raw).not.toContain('"relation"');
    });
  });

  describe('runtime', () => {
    let authorId: string;
    let bookId: string;

    it('creates an author and a book', async () => {
      const author = await request(app.getHttpServer())
        .post('/authors')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Machado de Assis' })
        .expect(201);

      const book = await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Dom Casmurro',
          isbn: '9788535914061',
          internalNote: 'first edition draft',
          authorId: author.body.id as string,
        })
        .expect(201);

      expect(book.body.title).toBe('Dom Casmurro');
      expect(book.body.isbn).toBe('9788535914061');
      expect(book.body.authorId).toBe(author.body.id);
      expect(book.body).not.toHaveProperty('internalNote');
      // `f.createdAt()` rows carry `Date`; the wire carries ISO strings.
      expect(typeof book.body.dateCreated).toBe('string');
      expect(Number.isNaN(Date.parse(book.body.dateCreated as string))).toBe(
        false,
      );

      authorId = author.body.id as string;
      bookId = book.body.id as string;
    });

    it('read returns the eager-loaded nested author', async () => {
      const res = await request(app.getHttpServer())
        .get(`/books/${bookId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.author).toMatchObject({
        id: authorId,
        name: 'Machado de Assis',
      });
      expect(res.body).not.toHaveProperty('internalNote');
    });

    it('list returns nested author on every row', async () => {
      const res = await request(app.getHttpServer())
        .get('/books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rows = res.body.data as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0].author).toMatchObject({ id: authorId });
    });

    it('update changes the title but silently drops the immutable isbn', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/books/${bookId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Dom Casmurro (rev.)', isbn: 'HACKED' })
        .expect(200);

      expect(res.body.title).toBe('Dom Casmurro (rev.)');
      expect(res.body.isbn).toBe('9788535914061');
    });

    it('rejects an invalid create body with 400', async () => {
      await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '', isbn: 'x', authorId: 'not-a-uuid' })
        .expect(400);
    });

    it('replace overwrites the full writable set', async () => {
      const res = await request(app.getHttpServer())
        .put(`/books/${bookId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Memórias Póstumas',
          isbn: '9788535914078',
          authorId,
        })
        .expect(200);

      expect(res.body.title).toBe('Memórias Póstumas');
      expect(res.body.isbn).toBe('9788535914078');
    });

    it('soft delete returns the deleted body, restore brings it back', async () => {
      const deleted = await request(app.getHttpServer())
        .delete(`/books/${bookId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(deleted.body.dateDeleted).toBeTruthy();

      await request(app.getHttpServer())
        .get(`/books/${bookId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      const restored = await request(app.getHttpServer())
        .patch(`/books/restore/${bookId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(restored.body.id).toBe(bookId);

      await request(app.getHttpServer())
        .get(`/books/${bookId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
