import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { SwaggerUiService } from '@concepta/rockets-core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { createSampleServerAuthOpenApiDocument } from '../src/swagger/create-openapi-document';
import { clearSwaggerUiEnv } from './helpers/clear-swagger-ui-env';
import { stableContractJson } from './helpers/stable-contract-json';

/**
 * Committed OpenAPI contract artifact (issue #54) for the hand-written-entity
 * half of the matrix: this app registers `defineResource` / `defineRocketsAuth`
 * resources whose request/response schemas are named zod schemas over
 * hand-written TypeORM entities. The `zodResource` + `operationResource` half
 * is pinned by `examples/sample-server/test/openapi-contract-export.e2e-spec.ts`.
 *
 * The document is built by the app's own `createSampleServerAuthOpenApiDocument`
 * helper — the one `main.ts` serves through — so this pins what the app
 * actually exposes, not a simplified reconstruction of it.
 */
const contractPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../contract.json',
);

describe('sample-server-auth OpenAPI contract export (issue #54)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    // The `info` block is deployment configuration (SWAGGER_UI_TITLE,
    // SWAGGER_UI_VERSION, …), not wire contract. Without this, anyone with
    // those exported in their shell gets a false drift report.
    clearSwaggerUiEnv();

    app = await NestFactory.create(AppModule, { logger: false });

    document = createSampleServerAuthOpenApiDocument(app);

    // Mount the UI exactly as `main.ts` does — before `init()`, same as the
    // real bootstrap — so the test below can assert the pinned artifact
    // against what the app actually serves over HTTP.
    app.get(SwaggerUiService).setup(app);

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('matches the committed contract.json (regenerate with CONTRACT_UPDATE=1)', () => {
    const generated = stableContractJson(document);

    if (process.env.CONTRACT_UPDATE === '1') {
      writeFileSync(contractPath, generated);
      return;
    }

    if (!existsSync(contractPath)) {
      throw new Error(
        `Missing ${contractPath}. Generate it with: ` +
          'CONTRACT_UPDATE=1 yarn sample-auth:contract:export',
      );
    }

    const committed = readFileSync(contractPath, 'utf8');
    expect(generated).toBe(committed);
  });

  it('serves that same document from the Swagger UI JSON endpoint', async () => {
    // The whole point of pinning: `contract.json` must be the document the
    // running app hands to clients, not a lookalike rebuilt in the spec. This
    // fails if `SwaggerUiService.setup()` ever stops routing through
    // `createDocument()`.
    const response = await request(app.getHttpServer())
      .get('/api-json')
      .expect(200);

    expect(response.body).toEqual(document);
  });
});
