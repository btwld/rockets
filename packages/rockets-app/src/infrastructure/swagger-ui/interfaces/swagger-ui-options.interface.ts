import { DocumentBuilder } from '@nestjs/swagger';

import { SwaggerUiSettingsInterface } from './swagger-ui-settings.interface';

export interface SwaggerUiOptionsInterface {
  settings?: SwaggerUiSettingsInterface;
  documentBuilder?: DocumentBuilder;
}
