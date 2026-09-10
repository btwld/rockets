import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { SwaggerUiService } from '@concepta/rockets-core';

/**
 * Builds the exact OpenAPI document this app serves at `/api`.
 *
 * `main.ts` and `test/openapi-contract-export.e2e-spec.ts` both call this —
 * that is the point. `SwaggerUiService.createDocument` installs the Rockets
 * Standard Schema converter, which is what turns every named zod schema
 * (CRUD resources, `/me`, the auth controller) into a `$ref`'d component.
 * A contract artifact generated from a plain `SwaggerModule.createDocument`
 * call would pin a document the app never serves.
 */
export function createSampleServerOpenApiDocument(
  app: INestApplication,
): OpenAPIObject {
  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();
  return swaggerUiService.createDocument(app);
}
