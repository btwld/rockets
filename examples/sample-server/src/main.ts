import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ExceptionsFilter } from '@bitwild/rockets';
import { SwaggerUiService } from '@bitwild/rockets-common';
import helmet from 'helmet';
import { UserMetadataUpdateDto } from './dto/user-metadata.dto';
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
  SwaggerModule.setup(swaggerPath, app, document);

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Sample server listening on http://localhost:${port}`);
}

bootstrap();
