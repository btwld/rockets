import { Inject, INestApplication, Injectable } from '@nestjs/common';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';

import { SwaggerUiSettingsInterface } from './interfaces/swagger-ui-settings.interface';
import { createRocketsStandardSchemaConverter } from './rockets-standard-schema.converter';
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

  /**
   * The configured `DocumentBuilder` — for ADDING metadata (title,
   * servers, security schemes) before the document is built.
   *
   * Never feed `builder().build()` to `SwaggerModule.createDocument`
   * yourself: that path has no `standardSchemaConverter`, so every
   * request body documents inline and only the response schemas Nest's
   * own `$defs` lifting happens to rescue appear under
   * `components.schemas`. The one external consumer did exactly this and
   * silently lost 21 of its 26 components. Build through
   * {@link createDocument} (or {@link setup}) — always.
   */
  builder(): DocumentBuilder {
    return this.documentBuilder;
  }

  /**
   * Builds the OpenAPI document without mounting the UI.
   *
   * This is the single seam every document consumer must go through —
   * `setup()` below, and anything that needs the document itself (a pinned
   * `contract.json` artifact, a structural test, an offline export). Building
   * a document by hand from `builder().build()` instead re-implements the
   * argument list and silently drifts from what the app serves the moment
   * `documentOptions` changes.
   *
   * Every named schema (`withOpenApi(schema, id)`) becomes a `$ref` to
   * `components/schemas/<id>` through the Rockets converter, built fresh
   * per document; an explicit `standardSchemaConverter` in the options
   * replaces it.
   *
   * @param app - Nest application to scan for routes.
   * @param documentOptions - Overrides the configured
   * `settings.documentOptions` when provided; apps that need per-call
   * `extraModels` pass them here.
   */
  createDocument(
    app: INestApplication,
    documentOptions?: SwaggerDocumentOptions,
  ): OpenAPIObject {
    const options = documentOptions ?? this.settings?.documentOptions;
    return SwaggerModule.createDocument(app, this.documentBuilder.build(), {
      ...options,
      standardSchemaConverter:
        options?.standardSchemaConverter ??
        createRocketsStandardSchemaConverter(),
    });
  }

  setup(app: INestApplication): void {
    SwaggerModule.setup(
      this.settings.path,
      app,
      this.createDocument(app),
      this.settings?.customOptions,
    );
  }
}
