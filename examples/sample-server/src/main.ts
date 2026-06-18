import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { ExceptionsFilter } from '@bitwild/rockets';
import { SwaggerUiService } from '@bitwild/rockets-app';
import helmet from 'helmet';
import { UserMetadataUpdateDto } from './user-metadata.schema';
import { patchMePatchOpenApi } from './swagger/patch-me-openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();

  const swaggerPath = process.env.SWAGGER_UI_PATH ?? 'api';
  const document = SwaggerModule.createDocument(
    app,
    swaggerUiService.builder().build(),
    {
      extraModels: [UserMetadataUpdateDto],
    },
  );
  patchMePatchOpenApi(document, UserMetadataUpdateDto);
  // nestjs-zod DTOs leave internal markers in the raw document; cleanup
  // only rewrites schemas generated from zod DTOs.
  SwaggerModule.setup(swaggerPath, app, cleanupOpenApiDoc(document));

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Sample server listening on http://localhost:${port}`);
}

bootstrap();
