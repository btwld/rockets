import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { createSampleServerOpenApiDocument } from '../src/swagger/create-openapi-document';
import { clearSwaggerUiEnv } from './helpers/clear-swagger-ui-env';
import { stableContractJson } from './helpers/stable-contract-json';

/**
 * Committed OpenAPI contract artifact (issue #54) for the zod half of the
 * matrix. This app is the one that exercises what issue #54's acceptance
 * criterion actually asks for:
 *
 * - CRUD `zodResource` (`/tags`, `/authors`, `/books`, `/pets`, `/reminders`,
 *   `/pet-vaccinations`),
 * - `zodSubResource` (`/pets/{petId}/tags`),
 * - `operationResource` non-CRUD ops (`/pets/{petId}/transfer`,
 *   `/pets/{petId}/share`),
 * - alongside a schema-based `defineResource` (`/appointments`) and the
 *   hand-written `/auth` controller in the same doc.
 *
 * The document is built by the app's own `createSampleServerOpenApiDocument`
 * helper — the one `main.ts` serves through, Rockets Standard Schema
 * converter included (named zod schemas → `$ref`'d components). Rebuilding
 * it here from a plain `SwaggerModule.createDocument` call would pin a
 * document this app never serves.
 */
const contractPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../contract.json',
);

describe('sample-server OpenAPI contract export (issue #54)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    // The `info` block is deployment configuration (SWAGGER_UI_TITLE,
    // SWAGGER_UI_VERSION, …), not wire contract. Without this, anyone with
    // those exported in their shell gets a false drift report.
    clearSwaggerUiEnv();

    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();

    document = createSampleServerOpenApiDocument(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('covers zod CRUD, zod sub-resource and operationResource paths', () => {
    const paths = Object.keys(document.paths);

    // Guards the claim in this file's docblock: if the sample app ever stops
    // registering the zod / operationResource shapes, the artifact silently
    // reverts to demonstrating only what sample-server-auth already does.
    // zod CRUD resource, zod sub-resource, operationResource ops.
    expect(paths).toContain('/tags');
    expect(paths).toContain('/pets/{petId}/tags');
    expect(paths).toContain('/pets/{petId}/transfer');
    expect(paths).toContain('/pets/{petId}/share');
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
          'CONTRACT_UPDATE=1 yarn sample:contract:export',
      );
    }

    const committed = readFileSync(contractPath, 'utf8');
    expect(generated).toBe(committed);
  });
});
