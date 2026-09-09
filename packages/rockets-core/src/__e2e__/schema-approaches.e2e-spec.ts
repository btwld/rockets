/**
 * Decision harness — NOT a PR test. It answers, from observed behaviour,
 * which form Rockets should use to declare a route's contract.
 *
 *   A — native   `@Body({ schema }) b: Type`   — what Nest documents
 *   B — carrier  `@Body() b: Dto`              — a DTO class holding the schema
 *
 * Context for a future reader: Nest 12's `.d.ts` documents
 * `@Query({ schema: z.object(...) })`, and `StandardSchemaValidationPipe`
 * reads ONLY `metadata.schema` — never the parameter's type. Form B
 * therefore requires a pipe subclass that digs the schema out of the class.
 * It is not the recommended path; it is the path that binds schema and type
 * into a single symbol.
 *
 * What this file measures:
 *   1. do both behave identically at runtime?   (assertions, not logs)
 *   2. do both document a named `$ref`?         (assertion)
 *   3. form A's type hole — schema X with the parameter typed as Y. Caught
 *      by neither `tsc` nor runtime. See `TypeHole`.
 *   4. form B's failure mode — without `design:paramtypes`, validation
 *      disappears silently. See `CarrierWithoutMetadata`.
 *   5. can a boot-time check turn 4 into a loud failure? See the canary.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Body,
  Controller,
  Injectable,
  Post,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  UseInterceptors,
  UsePipes,
  applyDecorators,
  type ArgumentMetadata,
  type INestApplication,
} from '@nestjs/common';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  ApiOkResponse,
  ApiTags,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { withOpenApi } from '@concepta/nestjs-core';
import request from 'supertest';
import { z } from 'zod';

import { rocketsSchemaValidation } from '../common/utils/standard-schema.util';
import { createRocketsStandardSchemaConverter } from '../common/swagger-ui/rockets-standard-schema.converter';

// ------------------------------------------------------------- carrier (B)
const CARRIED = Symbol.for('rockets.carriedSchema');

/** Every carrier ever built, so a boot check can look for them. */
const carrierRegistry = new Set<object>();

function schemaDto<S extends z.ZodType<object>>(schema: S) {
  class Dto {
    static readonly [CARRIED] = schema;
  }
  // The class is the VALUE holding the schema and the TYPE the schema
  // describes. TypeScript cannot join those two faces on its own; nothing
  // is ever instantiated.
  carrierRegistry.add(Dto);
  return Dto as unknown as (new () => z.output<S>) & { readonly [CARRIED]: S };
}

function carriedSchema(metatype: unknown): z.ZodType | undefined {
  const s = (metatype as Record<symbol, unknown> | undefined)?.[CARRIED];
  return s instanceof z.ZodType ? s : undefined;
}

/** The subclass form B requires: explicit schema wins, carrier is fallback. */
@Injectable()
class CarrierPipe extends StandardSchemaValidationPipe {
  override transform<T = unknown>(v: T, meta: ArgumentMetadata): Promise<T> {
    const schema = meta.schema ?? carriedSchema(meta.metatype);
    return super.transform(v, { ...meta, schema });
  }
}

// ------------------------------------------------------------------ contract
const inSchema = withOpenApi(
  z.object({
    name: z.string(),
    age: z.number(),
    nested: z.object({ a: z.string() }).optional(),
  }),
  'ApproachInDto',
);
const outSchema = withOpenApi(
  z.object({ id: z.string(), name: z.string() }),
  'ApproachOutDto',
);
type In = z.output<typeof inSchema>;
class InDto extends schemaDto(inSchema) {}

const handlers = {
  echo: (b: In) => ({ id: '1', name: b.name }),
  extra: () => ({ id: '1', name: 'ana', secret: 'MUST_NOT_LEAK' }),
  missing: () => ({ id: '1' }),
  wrongType: () => ({ id: 123, name: 'ana' }),
};

@ApiTags('schema-approaches')
@Controller('a')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
@UseInterceptors(new StandardSchemaSerializerInterceptor(new Reflector()))
class ApproachA {
  @Post('echo')
  @ApiOkResponse({ description: 'probe' })
  @SerializeOptions({ schema: outSchema })
  echo(@Body({ schema: inSchema }) b: In) {
    return handlers.echo(b);
  }
  @Post('extra')
  @ApiOkResponse({ description: 'probe' })
  @SerializeOptions({ schema: outSchema })
  extra() {
    return handlers.extra();
  }
  @Post('missing')
  @ApiOkResponse({ description: 'probe' })
  @SerializeOptions({ schema: outSchema })
  missing() {
    return handlers.missing();
  }
  @Post('wrong-type')
  @ApiOkResponse({ description: 'probe' })
  @SerializeOptions({ schema: outSchema })
  wrongType() {
    return handlers.wrongType();
  }
}

@ApiTags('schema-approaches')
@Controller('b')
@UsePipes(new CarrierPipe(rocketsSchemaValidation))
@UseInterceptors(new StandardSchemaSerializerInterceptor(new Reflector()))
class ApproachB {
  @Post('echo')
  @ApiOkResponse({ description: 'probe' })
  @SerializeOptions({ schema: outSchema })
  echo(@Body() b: InDto) {
    return handlers.echo(b);
  }
  @Post('extra')
  @ApiOkResponse({ description: 'probe' })
  @SerializeOptions({ schema: outSchema })
  extra() {
    return handlers.extra();
  }
  @Post('missing')
  @ApiOkResponse({ description: 'probe' })
  @SerializeOptions({ schema: outSchema })
  missing() {
    return handlers.missing();
  }
  @Post('wrong-type')
  @ApiOkResponse({ description: 'probe' })
  @SerializeOptions({ schema: outSchema })
  wrongType() {
    return handlers.wrongType();
  }
}

/**
 * FORM A'S HOLE, isolated. The decorator says `inSchema`; the parameter is
 * typed as something unrelated. This COMPILES (run `yarn typecheck:spec`)
 * and does not throw at runtime — the test below shows the 201 carrying
 * `undefined`. In form B it cannot be written: there is only one symbol.
 */
const otherSchema = withOpenApi(
  z.object({ totallyDifferent: z.number() }),
  'ApproachOtherDto',
);
type Other = z.output<typeof otherSchema>;

@ApiTags('schema-approaches')
@Controller('hole')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
class TypeHole {
  @Post()
  @ApiOkResponse({ description: 'probe' })
  h(@Body({ schema: inSchema }) body: Other) {
    const n: number = body.totallyDifferent;
    return { promisedType: 'number', actualTypeof: typeof n, actualBody: body };
  }
}

/**
 * FORM B'S FAILURE MODE — what decides the choice.
 *
 * Form B discovers the schema through `metadata.metatype`, which only exists
 * when the compiler emitted `design:paramtypes` (`emitDecoratorMetadata`).
 * A consumer on esbuild/vite/stage-3 decorators may not emit it. Both
 * controllers below are mounted with `Object` in the body slot, which is
 * exactly what that produces.
 *
 * Rockets is a library: the compiler is the CONSUMER's choice, not ours.
 */
@ApiTags('schema-approaches')
@Controller('b-no-metadata')
@UsePipes(new CarrierPipe(rocketsSchemaValidation))
class CarrierWithoutMetadata {}
{
  const proto = CarrierWithoutMetadata.prototype as Record<string, unknown>;
  proto['h'] = function (b: unknown) {
    return { received: b };
  };
  const d = Object.getOwnPropertyDescriptor(proto, 'h')!;
  applyDecorators(Post())(proto, 'h', d);
  Body()(proto, 'h', 0);
  Reflect.defineMetadata(PARAMTYPES_METADATA, [Object], proto, 'h');
}

@ApiTags('schema-approaches')
@Controller('a-no-metadata')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
class NativeWithoutMetadata {}
{
  const proto = NativeWithoutMetadata.prototype as Record<string, unknown>;
  proto['h'] = function (b: unknown) {
    return { received: b };
  };
  const d = Object.getOwnPropertyDescriptor(proto, 'h')!;
  applyDecorators(Post())(proto, 'h', d);
  Body({ schema: inSchema })(proto, 'h', 0);
  Reflect.defineMetadata(PARAMTYPES_METADATA, [Object], proto, 'h');
}

/**
 * Could a boot check make form B fail loudly instead of silently?
 *
 * The idea: if the app defined carriers at all, at least one route should
 * carry one in its `design:paramtypes`. None appearing means the compiler
 * dropped the metadata, and every carrier route is running unvalidated.
 */
function carrierMetadataReaches(
  controllers: ReadonlyArray<new (...args: never[]) => object>,
): boolean {
  if (carrierRegistry.size === 0) return true;
  for (const controller of controllers) {
    const proto = controller.prototype as object;
    for (const key of Object.getOwnPropertyNames(proto)) {
      const types: unknown = Reflect.getMetadata(
        PARAMTYPES_METADATA,
        proto,
        key,
      );
      // Detected through the carried symbol, not class identity: apps
      // subclass the factory result (`class InDto extends schemaDto(s) {}`),
      // so the registered object is the parent. Statics are inherited.
      if (
        Array.isArray(types) &&
        types.some((t) => carriedSchema(t) !== undefined)
      ) {
        return true;
      }
    }
  }
  return false;
}

const CASES: ReadonlyArray<readonly [string, string, object]> = [
  ['valid request', 'echo', { name: 'ana', age: 1 }],
  ['wrong input type', 'echo', { name: 'ana', age: '5' }],
  ['unknown key at top level', 'echo', { name: 'ana', age: 1, EVIL: 'x' }],
  [
    'unknown key nested',
    'echo',
    { name: 'ana', age: 1, nested: { a: 'z', EVIL: 'x' } },
  ],
  ['response with an extra field', 'extra', {}],
  ['response missing a required field', 'missing', {}],
  ['response with a wrong type', 'wrong-type', {}],
];

describe('contract declaration forms: native (A) vs carrier (B)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [
        ApproachA,
        ApproachB,
        TypeHole,
        CarrierWithoutMetadata,
        NativeWithoutMetadata,
      ],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  const post = async (path: string, body: object): Promise<string> => {
    const r = await request(app.getHttpServer()).post(path).send(body);
    return `${r.status} ${JSON.stringify(r.body)}`;
  };

  for (const [label, route, body] of CASES) {
    it(`${label} — A and B agree`, async () => {
      const a = await post(`/a/${route}`, body);
      const b = await post(`/b/${route}`, body);
      // eslint-disable-next-line no-console
      console.log(`\n${label}\n  A ${a}\n  B ${b}`);
      expect(b).toBe(a);
    });
  }

  it('both document a named component through $ref', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('approaches').build(),
      { standardSchemaConverter: createRocketsStandardSchemaConverter() },
    ) as unknown as { paths: Record<string, never> };
    const ref = (p: string): unknown =>
      doc.paths[p]?.['post']?.['requestBody']?.['content']?.[
        'application/json'
      ]?.['schema'];
    // eslint-disable-next-line no-console
    console.log(
      '\nrequestBody $ref\n  A',
      JSON.stringify(ref('/a/echo')),
      '\n  B',
      JSON.stringify(ref('/b/echo')),
    );
    expect(JSON.stringify(ref('/a/echo'))).toContain('$ref');
    expect(JSON.stringify(ref('/b/echo'))).toContain('$ref');
  });

  it("FORM A's HOLE: a schema/type mismatch passes silently", async () => {
    const r = await post('/hole', { name: 'ana', age: 1 });
    // eslint-disable-next-line no-console
    console.log(`\ntype hole (form A only)\n  ${r}`);
    // 201 carrying `undefined` where the type promised a number. Neither
    // `tsc` nor the runtime says anything.
    expect(r).toContain('"actualTypeof":"undefined"');
    expect(r).toContain('201');
  });

  it("FORM B's FAILURE: without decorator metadata, validation disappears", async () => {
    const invalid = { name: 'ana', age: 'NOT_A_NUMBER' };
    const b = await post('/b-no-metadata', invalid);
    const a = await post('/a-no-metadata', invalid);
    // eslint-disable-next-line no-console
    console.log(
      `\nwithout emitDecoratorMetadata (age should 400)\n  B ${b}\n  A ${a}`,
    );
    // Form B accepts garbage with a 201: with no metatype there is no schema
    // to find, and the pipe lets it through. No error, no log, no signal.
    expect(b).toContain('201');
    expect(b).toContain('NOT_A_NUMBER');
    // Form A does not rely on reflection: the schema is in the decorator.
    expect(a).toContain('400');
  });

  it('a boot check can turn that silent failure into a loud one', () => {
    // Compiled normally: the carrier reaches at least one route.
    expect(carrierMetadataReaches([ApproachB])).toBe(true);
    // Compiled without metadata: nothing carries it, and the check can say so
    // at boot instead of letting every carrier route run unvalidated.
    expect(carrierMetadataReaches([CarrierWithoutMetadata])).toBe(false);
  });
});
