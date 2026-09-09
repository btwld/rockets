import type { FactoryProvider } from '@nestjs/common';

import { SwaggerUiSettingsInterface } from '../interfaces/swagger-ui-settings.interface';
import { SWAGGER_UI_DEFAULT_SETTINGS_TOKEN } from '../swagger-ui.constants';

export const swaggerUiDefaultConfig = {
  provide: SWAGGER_UI_DEFAULT_SETTINGS_TOKEN,
  useFactory: (): SwaggerUiSettingsInterface => ({
    path: process.env.SWAGGER_UI_PATH ?? 'api',
    title: process.env.SWAGGER_UI_TITLE ?? 'API',
    description: process.env.SWAGGER_UI_DESCRIPTION ?? 'API Documentation',
    version: process.env.SWAGGER_UI_VERSION ?? '0.0.0',
    basePath: process.env.SWAGGER_UI_BASE_PATH ?? '',
    termsOfService: process.env.SWAGGER_UI_TOS ?? '',
    contact: {
      name: process.env.SWAGGER_UI_CONTACT_NAME ?? '',
      url: process.env.SWAGGER_UI_CONTACT_URL ?? '',
      email: process.env.SWAGGER_UI_CONTACT_EMAIL ?? '',
    },
    license: {
      name: process.env.SWAGGER_UI_LICENSE_NAME ?? '',
      url: process.env.SWAGGER_UI_LICENSE_URL ?? '',
    },
  }),
} satisfies FactoryProvider<SwaggerUiSettingsInterface>;
