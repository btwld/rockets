import { SwaggerCustomOptions, SwaggerDocumentOptions } from '@nestjs/swagger';

export interface SwaggerUiSettingsInterface {
  path: string;
  documentOptions?: SwaggerDocumentOptions;
  customOptions?: SwaggerCustomOptions;
  title?: string;
  description?: string;
  version?: string;
  termsOfService?: string;
  contact?: {
    name: string;
    url: string;
    email: string;
  };
  license?: {
    name: string;
    url: string;
  };
  basePath?: string;
}
