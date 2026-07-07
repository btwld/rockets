import {
  INestApplication,
  Injectable,
  Module,
  PlainLiteralObject,
  ValidationPipe,
} from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import request from 'supertest';
import { z } from 'zod';
import {
  ExceptionsFilter,
  RocketsModule,
  defineTypeOrmRepository,
} from '@bitwild/rockets';
import type {
  RocketsRepositoryModuleInterface,
  SchemaEntityCompiler,
  SchemaEntityCompilerOptions,
} from '@bitwild/rockets';
import { CrudAdapter, CrudCreateCommand } from '@concepta/nestjs-crud';
import { CrudCommandHandlerBase, InjectCrudAdapter } from '@bitwild/rockets-core';
import {
  InjectDynamicRepository,
  RepositoryInterface,
} from '@concepta/nestjs-repository';
import {
  UserMetadataCreateDto,
  UserMetadataEntity,
  UserMetadataUpdateDto,
} from '../src/user-metadata.schema';
import { defineSampleAuth, sampleAuthUserResource } from '../src/auth';
import { rocketsEntityMeta, rocketsFieldMeta } from '@bitwild/rockets-zod';
import { typeOrmZodEntityCompiler } from '@bitwild/rockets-zod-typeorm';
import { zodResource } from '../src/zod-bindings';

/**
 * Coverage spec for the remaining defineResource surface mapped to zod:
 *
 * - `db.column` raw ColumnOptions passthrough (decimal precision,
 *   simple-json) — column types the zod mapping cannot derive.
 * - `rocketsEntityMeta` composite UNIQUE on the object schema.
 * - `hasMany` relation (z.array field → @OneToMany, exposed as an array
 *   of the child's response projection).
 * - per-operation custom `handler` passthrough (`operations.create.handler`)
 *   — the handler stamps a server-side `slug` (dto.create: false).
 */
const categoryProductSuffix = 'zfc';

export const productSchema = z.object({
  id: z
    .uuid()
    .register(rocketsFieldMeta, { db: { pk: true, generated: true } }),
  name: z.string().min(1).max(100),
  /** Server-computed by ProductCreateHandler — never client-supplied. */
  slug: z
    .string()
    .max(120)
    .register(rocketsFieldMeta, { dto: { create: false, update: false } })
    .optional(),
  price: z.number().register(rocketsFieldMeta, {
    db: { column: { type: 'decimal', precision: 10, scale: 2 } },
  }),
  attrs: z
    .record(z.string(), z.unknown())
    .register(rocketsFieldMeta, { db: { column: { type: 'simple-json' } } })
    .optional(),
  categoryId: z.uuid().register(rocketsFieldMeta, {
    db: { index: true },
    // Explicit `unknown` return: product↔category reference each other;
    // the annotation stops TS from chasing the type cycle (TS7022) —
    // the thunk is narrowed at runtime anyway.
    relation: { target: (): unknown => categorySchema, onDelete: 'CASCADE' },
  }),
  dateCreated: z.iso
    .datetime()
    .register(rocketsFieldMeta, { db: { createdAt: true } }),
});

export const categorySchema = z.object({
  id: z
    .uuid()
    .register(rocketsFieldMeta, { db: { pk: true, generated: true } }),
  name: z.string().min(1).max(100),
  products: z.array(productSchema).register(rocketsFieldMeta, {
    relation: {
      kind: 'hasMany',
      target: (): unknown => productSchema,
      mappedBy: 'categoryId',
      expose: true,
    },
  }),
  dateCreated: z.iso
    .datetime()
    .register(rocketsFieldMeta, { db: { createdAt: true } }),
});

// Composite UNIQUE: a product name may repeat across categories but not
// within one. Registered on the OBJECT schema (entity-level meta).
const uniqueProductSchema = productSchema.register(rocketsEntityMeta, {
  unique: [['categoryId', 'name']],
});

export const categoryZodResource = zodResource({
  name: `Category${categoryProductSuffix}`,
  schema: categorySchema,
  table: 'zfc_categories',
  path: 'zfc-categories',
  operations: ['list', 'read', 'create'],
});

@Injectable()
class ProductCreateHandler extends CrudCommandHandlerBase<PlainLiteralObject> {
  constructor(
    @InjectCrudAdapter(`product${categoryProductSuffix}`)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
    @InjectDynamicRepository(`product${categoryProductSuffix}`)
    private readonly repo: RepositoryInterface<PlainLiteralObject>,
  ) {
    super(crudAdapter);
  }

  async execute(
    command: CrudCreateCommand<PlainLiteralObject, PlainLiteralObject>,
  ): Promise<PlainLiteralObject> {
    const { context, dto } = command;
    const name = typeof dto.name === 'string' ? dto.name : '';
    return this.repo.create(
      { ...dto, slug: name.toLowerCase().replace(/\s+/g, '-') },
      { ctx: context },
    );
  }
}

export const productZodResource = zodResource({
  name: `Product${categoryProductSuffix}`,
  schema: uniqueProductSchema,
  key: `product${categoryProductSuffix}`,
  table: 'zfc_products',
  path: 'zfc-products',
  operations: {
    list: true,
    read: true,
    create: { handler: ProductCreateHandler },
  },
});

describe('zod full defineResource coverage (e2e)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;
  let token: string;
  let categoryId: string;

  beforeAll(async () => {
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
          resources: [
            sampleAuthUserResource,
            categoryZodResource,
            productZodResource,
          ],
        }),
      ],
    })
    class CoverageModule {}

    app = await NestFactory.create(CoverageModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();

    doc = cleanupOpenApiDoc(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle('coverage')
          .setVersion('1.0')
          .addBearerAuth()
          .build(),
      ),
    );

    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'zod-coverage@example.com',
        password: 'password123',
        name: 'Coverage',
      })
      .expect(201);
    token = signup.body.accessToken as string;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
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

  describe('OpenAPI document', () => {
    it('create DTO excludes the server-computed slug; response includes it', () => {
      const create = schemaOf('ProductzfcCreateDto').properties as Record<
        string,
        unknown
      >;
      expect(create).not.toHaveProperty('slug');
      expect(create).toHaveProperty('price');
      expect(create).toHaveProperty('attrs');
      const response = schemaOf('ProductzfcResponseDto').properties as Record<
        string,
        unknown
      >;
      expect(response).toHaveProperty('slug');
    });

    it('category response exposes the hasMany products projection as an array', () => {
      const properties = schemaOf('CategoryzfcResponseDto')
        .properties as Record<string, Record<string, unknown>>;
      expect(properties.products).toMatchObject({ type: 'array' });
      const items = properties.products.items as Record<string, unknown>;
      const nested = items.properties as Record<string, unknown>;
      expect(nested).toHaveProperty('slug');
      expect(nested).toHaveProperty('price');
      expect(nested).not.toHaveProperty('products');
    });
  });

  describe('runtime', () => {
    it('custom create handler stamps the slug (operations.create.handler passthrough)', async () => {
      const category = await request(app.getHttpServer())
        .post('/zfc-categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Pet Food' })
        .expect(201);
      categoryId = category.body.id as string;

      const product = await request(app.getHttpServer())
        .post('/zfc-products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Premium Kibble',
          price: 49.9,
          attrs: { weightKg: 12, flavor: 'chicken' },
          categoryId,
        })
        .expect(201);

      expect(product.body.slug).toBe('premium-kibble');
      // decimal column round-trip (sqlite may surface it as string)
      expect(Number(product.body.price)).toBe(49.9);
      // simple-json column round-trip
      expect(product.body.attrs).toEqual({ weightKg: 12, flavor: 'chicken' });
    });

    it('composite UNIQUE (entity meta) rejects a duplicate name within the category', async () => {
      const duplicate = await request(app.getHttpServer())
        .post('/zfc-products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Premium Kibble', price: 10, categoryId });
      expect(duplicate.status).toBeGreaterThanOrEqual(400);

      // Same name in ANOTHER category is fine — the constraint is composite.
      const other = await request(app.getHttpServer())
        .post('/zfc-categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Cat Food' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/zfc-products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Premium Kibble',
          price: 39.9,
          categoryId: other.body.id as string,
        })
        .expect(201);
    });

    it('repository.entityCompiler (adapter-owned) wins over the app default', () => {
      const seen: Array<{ schema: unknown; options: SchemaEntityCompilerOptions }> =
        [];
      const customCompiler: SchemaEntityCompiler = {
        compileEntity(schema, options) {
          seen.push({ schema, options });
          return typeOrmZodEntityCompiler.compileEntity(schema, options);
        },
      };
      const probeAdapter: RocketsRepositoryModuleInterface = {
        name: 'ProbeAdapter',
        forFeature: () => ({ module: class ProbeModule {} }),
        entityCompiler: customCompiler,
      };

      const probeSchema = z.object({
        id: z
          .uuid()
          .register(rocketsFieldMeta, { db: { pk: true, generated: true } }),
        label: z.string().max(50),
      });

      const resource = zodResource({
        name: 'CompilerProbe',
        schema: probeSchema,
        table: 'compiler_probe',
        operations: ['list'],
        repository: probeAdapter,
      });

      expect(seen).toHaveLength(1);
      expect(seen[0].schema).toBe(probeSchema);
      expect(seen[0].options).toEqual({
        name: 'CompilerProbeEntity',
        table: 'compiler_probe',
      });
      expect(resource.zod.entity.name).toBe('CompilerProbeEntity');
    });

    it('the TypeORM compiler rejects non-zod schemas at boot time', () => {
      expect(() =>
        typeOrmZodEntityCompiler.compileEntity('not-a-schema', {
          name: 'BrokenEntity',
          table: 'broken',
        }),
      ).toThrow(/not a zod object/);
    });

    it('hasMany expose: category read returns the nested products array', async () => {
      const res = await request(app.getHttpServer())
        .get(`/zfc-categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const products = res.body.products as Array<Record<string, unknown>>;
      expect(products).toHaveLength(1);
      expect(products[0]).toMatchObject({
        name: 'Premium Kibble',
        slug: 'premium-kibble',
        categoryId,
      });
    });
  });
});
