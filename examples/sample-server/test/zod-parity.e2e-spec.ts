import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import request from 'supertest';
import {
  ExceptionsFilter,
  RocketsModule,
  defineTypeOrmRepository,
} from '@bitwild/rockets';
import type { ResourceInput } from '@bitwild/rockets';
import {
  UserMetadataCreateDto,
  UserMetadataEntity,
  UserMetadataUpdateDto,
} from '../src/user-metadata.schema';
import { defineSampleAuth, sampleAuthUserResource } from '../src/auth';
import {
  authorControlResource,
  bookControlResource,
} from './__fixtures__/zod-parity/author-book.control';
import {
  authorZodResource,
  bookZodResource,
} from '../src/resources/library';

/**
 * Parity contract between `zodResource` and `defineResource`.
 *
 * The author/book pair exercises what the tag golden test cannot:
 * - `dto` field roles (create-only `isbn`, write-only `internalNote`)
 * - a `relation` FK (`authorId` → author) compiled into the generated
 *   entity (ManyToOne + JoinColumn + eager) and exposed in the response
 *   document as a nested object
 *
 * Two symmetric apps are booted — handwritten control vs zod twin —
 * and BOTH the OpenAPI documents and the runtime behavior are compared.
 * Whatever defineResource does, the zod translation must do.
 */
describe('zodResource ↔ defineResource parity (e2e)', () => {
  interface BootedApp {
    readonly app: INestApplication;
    readonly doc: OpenAPIObject;
    readonly token: string;
  }

  let control: BootedApp;
  let zod: BootedApp;

  async function bootApp(
    resources: ResourceInput[],
    email: string,
  ): Promise<BootedApp> {
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
          resources: [sampleAuthUserResource, ...resources],
        }),
      ],
    })
    class ParityModule {}

    const app = await NestFactory.create(ParityModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();

    const doc = cleanupOpenApiDoc(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle('parity')
          .setVersion('1.0')
          .addBearerAuth()
          .build(),
      ),
    );

    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email, password: 'password123', name: 'Parity Tester' })
      .expect(201);

    return { app, doc, token: signup.body.accessToken as string };
  }

  beforeAll(async () => {
    control = await bootApp(
      [authorControlResource, bookControlResource],
      'parity-control@example.com',
    );
    zod = await bootApp(
      [authorZodResource, bookZodResource],
      'parity-zod@example.com',
    );
  }, 120000);

  afterAll(async () => {
    await control?.app.close();
    await zod?.app.close();
  });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function schemaOf(doc: OpenAPIObject, name: string): Record<string, unknown> {
    const schema: unknown = doc.components?.schemas?.[name];
    if (!isRecord(schema)) {
      throw new Error(`Schema "${name}" missing from document components`);
    }
    return schema;
  }

  describe('OpenAPI document parity', () => {
    it.each([
      '/authors',
      '/authors/{id}',
      '/books',
      '/books/{id}',
      '/books/restore/{id}',
    ])('%s path is deep-equal between control and zod', (path) => {
      expect(zod.doc.paths[path]).toBeDefined();
      expect(zod.doc.paths[path]).toEqual(control.doc.paths[path]);
    });

    it.each([
      'AuthorResponseDto',
      'AuthorCreateDto',
      'BookResponseDto',
      'BookCreateDto',
      'BookUpdateDto',
      'BookReplaceDto',
    ])('%s: handwritten schema is a subset of the zod schema', (name) => {
      // Strip the nested `author` property before subset-matching: the
      // control documents it as a $ref to AuthorResponseDto while the
      // zod twin inlines the projected shape — same wire data, different
      // (equally valid) OpenAPI encodings. Asserted separately below.
      const { author: zodAuthor, ...zodProps } = (
        schemaOf(zod.doc, name).properties ?? {}
      ) as Record<string, unknown>;
      const { author: controlAuthor, ...controlProps } = (
        schemaOf(control.doc, name).properties ?? {}
      ) as Record<string, unknown>;
      expect(zodProps).toMatchObject(controlProps);
      expect(zodAuthor === undefined).toBe(controlAuthor === undefined);
    });

    it('BookUpdateDto excludes the create-only isbn in both documents', () => {
      expect(schemaOf(control.doc, 'BookUpdateDto').properties).not.toHaveProperty('isbn');
      expect(schemaOf(zod.doc, 'BookUpdateDto').properties).not.toHaveProperty('isbn');
    });

    it('BookResponseDto excludes the write-only internalNote in both documents', () => {
      expect(schemaOf(control.doc, 'BookResponseDto').properties).not.toHaveProperty('internalNote');
      expect(schemaOf(zod.doc, 'BookResponseDto').properties).not.toHaveProperty('internalNote');
      expect(schemaOf(control.doc, 'BookCreateDto').properties).toHaveProperty('internalNote');
      expect(schemaOf(zod.doc, 'BookCreateDto').properties).toHaveProperty('internalNote');
    });

    it('zod BookResponseDto exposes the nested author projection', () => {
      const properties = schemaOf(zod.doc, 'BookResponseDto')
        .properties as Record<string, Record<string, unknown>>;
      expect(properties.author).toMatchObject({ type: 'object' });
      const nested = properties.author.properties as Record<string, unknown>;
      expect(Object.keys(nested).sort()).toEqual([
        'dateCreated',
        'dateUpdated',
        'id',
        'name',
      ]);
    });

    it('zod field meta namespaces do not leak into the document', () => {
      const raw = JSON.stringify(zod.doc.components?.schemas);
      expect(raw).not.toContain('"db"');
      expect(raw).not.toContain('"dto"');
      expect(raw).not.toContain('"relation"');
    });
  });

  describe('runtime parity', () => {
    interface CreatedIds {
      authorId: string;
      bookId: string;
    }
    const created = new Map<string, CreatedIds>();

    const styles: ReadonlyArray<[string, () => BootedApp]> = [
      ['control', () => control],
      ['zod', () => zod],
    ];

    it.each(styles)('%s: creates an author and a book', async (style, get) => {
      const { app, token } = get();
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

      created.set(style, {
        authorId: author.body.id as string,
        bookId: book.body.id as string,
      });
    });

    it.each(styles)(
      '%s: read returns the eager-loaded nested author',
      async (style, get) => {
        const { app, token } = get();
        const ids = created.get(style);
        if (!ids) throw new Error('create test must run first');

        const res = await request(app.getHttpServer())
          .get(`/books/${ids.bookId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(res.body.author).toMatchObject({
          id: ids.authorId,
          name: 'Machado de Assis',
        });
        expect(res.body).not.toHaveProperty('internalNote');
      },
    );

    it.each(styles)(
      '%s: list returns nested author on every row',
      async (style, get) => {
        const { app, token } = get();
        const ids = created.get(style);
        if (!ids) throw new Error('create test must run first');

        const res = await request(app.getHttpServer())
          .get('/books')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        const rows = res.body.data as Array<Record<string, unknown>>;
        expect(rows).toHaveLength(1);
        expect(rows[0].author).toMatchObject({ id: ids.authorId });
      },
    );

    it.each(styles)(
      '%s: update changes the title but silently drops the immutable isbn',
      async (style, get) => {
        const { app, token } = get();
        const ids = created.get(style);
        if (!ids) throw new Error('create test must run first');

        const res = await request(app.getHttpServer())
          .patch(`/books/${ids.bookId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ title: 'Dom Casmurro (rev.)', isbn: 'HACKED' })
          .expect(200);

        expect(res.body.title).toBe('Dom Casmurro (rev.)');
        expect(res.body.isbn).toBe('9788535914061');
      },
    );

    it.each(styles)(
      '%s: rejects an invalid create body with 400',
      async (style, get) => {
        const { app, token } = get();
        await request(app.getHttpServer())
          .post('/books')
          .set('Authorization', `Bearer ${token}`)
          .send({ title: '', isbn: 'x', authorId: 'not-a-uuid' })
          .expect(400);
      },
    );

    it.each(styles)(
      '%s: replace overwrites the full writable set',
      async (style, get) => {
        const { app, token } = get();
        const ids = created.get(style);
        if (!ids) throw new Error('create test must run first');

        const res = await request(app.getHttpServer())
          .put(`/books/${ids.bookId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            title: 'Memórias Póstumas',
            isbn: '9788535914078',
            authorId: ids.authorId,
          })
          .expect(200);

        expect(res.body.title).toBe('Memórias Póstumas');
        expect(res.body.isbn).toBe('9788535914078');
      },
    );

    it.each(styles)(
      '%s: soft delete returns the deleted body, restore brings it back',
      async (style, get) => {
        const { app, token } = get();
        const ids = created.get(style);
        if (!ids) throw new Error('create test must run first');

        const deleted = await request(app.getHttpServer())
          .delete(`/books/${ids.bookId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(deleted.body.dateDeleted).toBeTruthy();

        await request(app.getHttpServer())
          .get(`/books/${ids.bookId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(404);

        const restored = await request(app.getHttpServer())
          .patch(`/books/restore/${ids.bookId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(restored.body.id).toBe(ids.bookId);

        await request(app.getHttpServer())
          .get(`/books/${ids.bookId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      },
    );
  });
});
