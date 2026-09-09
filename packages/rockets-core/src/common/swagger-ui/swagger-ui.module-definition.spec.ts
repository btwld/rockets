import { SWAGGER_UI_DEFAULT_SETTINGS_TOKEN } from './swagger-ui.constants';
import { describe, expect, it } from 'vitest';

import { SwaggerUiModule } from './swagger-ui.module';

class SecretsModule {}

describe('SwaggerUiModule definition', () => {
  it('preserves caller imports for async factory dependencies', () => {
    const definition = SwaggerUiModule.registerAsync({
      imports: [SecretsModule],
      useFactory: () => ({}),
    });

    expect(definition.imports).toContain(SecretsModule);
  });

  it('registers the package-owned default settings provider', () => {
    const definition = SwaggerUiModule.registerAsync({
      imports: [SecretsModule],
      useFactory: () => ({}),
    });

    expect(definition.providers).toContainEqual(
      expect.objectContaining({ provide: SWAGGER_UI_DEFAULT_SETTINGS_TOKEN }),
    );
  });

  it('does not leak synchronous options onto DynamicModule metadata', () => {
    const definition = SwaggerUiModule.register({
      settings: { path: 'docs' },
    });

    expect(definition).not.toHaveProperty('settings');
  });
});
