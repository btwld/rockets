import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ExceptionsFilter } from '@bitwild/rockets-server';
import { SwaggerUiService } from '@concepta/nestjs-swagger-ui';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
   
  // Get the swagger ui service, and set it up
  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();
  swaggerUiService.setup(app);

  const exceptionsFilter = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter)); 
  
  await app.listen(3000);
  // eslint-disable-next-line no-console
  console.log('Sample server listening on http://localhost:3000');
}

bootstrap();


