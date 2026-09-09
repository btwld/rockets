import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { server } from './app.module';
import { ExceptionsFilter } from '@concepta/rockets';

import helmet from 'helmet';
import { createSampleServerOpenApiDocument } from './swagger/create-openapi-document';

async function bootstrap() {
  const app = await NestFactory.create(server);

  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  });
  // No global pipe: every route (generated CRUD, `/me`, `/auth`,
  // `pets/:petId/share`) carries its own per-route Standard Schema pipe —
  // a global `StandardSchemaValidationPipe` is refused at boot.

  const swaggerPath = process.env.SWAGGER_UI_PATH ?? 'api';
  // Same builder call the contract-export spec uses, so the pinned
  // `contract.json` is by construction the document served here.
  SwaggerModule.setup(swaggerPath, app, createSampleServerOpenApiDocument(app));

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Sample server listening on http://localhost:${port}`);
}

bootstrap();
