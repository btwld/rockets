import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ExceptionsFilter } from '@bitwild/rockets';
import { SwaggerUiService } from '@bitwild/rockets-app';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { UserMetadataUpdateDto } from './user-metadata.schema';
import { patchMePatchOpenApi } from './swagger/patch-me-openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();

  const swaggerPath = process.env.SWAGGER_UI_PATH ?? 'api';
  const document = SwaggerModule.createDocument(
    app,
    swaggerUiService.builder().build(),
    { extraModels: [UserMetadataUpdateDto] },
  );
  patchMePatchOpenApi(document, UserMetadataUpdateDto);
  SwaggerModule.setup(swaggerPath, app, document);

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`sample-code-review listening on http://localhost:${port}`);
}

bootstrap();
