import { Inject, INestApplication, Injectable } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { SwaggerUiSettingsInterface } from './interfaces/swagger-ui-settings.interface';
import {
  SWAGGER_UI_MODULE_DOCUMENT_BUILDER_TOKEN,
  SWAGGER_UI_MODULE_SETTINGS_TOKEN,
} from './swagger-ui.constants';

@Injectable()
export class SwaggerUiService {
  constructor(
    @Inject(SWAGGER_UI_MODULE_SETTINGS_TOKEN)
    protected readonly settings: SwaggerUiSettingsInterface,
    @Inject(SWAGGER_UI_MODULE_DOCUMENT_BUILDER_TOKEN)
    protected readonly documentBuilder: DocumentBuilder,
  ) {}

  builder(): DocumentBuilder {
    return this.documentBuilder;
  }

  setup(app: INestApplication): void {
    const document = SwaggerModule.createDocument(
      app,
      this.documentBuilder.build(),
      this.settings?.documentOptions,
    );

    SwaggerModule.setup(
      this.settings.path,
      app,
      document,
      this.settings?.customOptions,
    );
  }
}
