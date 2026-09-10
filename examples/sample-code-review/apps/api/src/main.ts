import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ExceptionsFilter } from '@concepta/rockets';

import helmet from 'helmet';

import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { SwaggerUiService } from '@concepta/rockets-core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    credentials: true,
  });

  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();

  const swaggerPath = process.env.SWAGGER_UI_PATH ?? 'api';
  SwaggerModule.setup(swaggerPath, app, swaggerUiService.createDocument(app));

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`sample-code-review listening on http://localhost:${port}`);
}

bootstrap();
