import {
  Injectable,
  type OnApplicationBootstrap,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { ApplicationConfig } from '@nestjs/core';

/**
 * Boot check: a GLOBAL `StandardSchemaValidationPipe` is rejected.
 *
 * Nest runs global pipes before a route's own pipes and hands both the
 * same `metadata.schema`. Every Rockets route already carries its own
 * per-route pipe, so a global one validates each body twice — and a
 * transforming schema (`z.coerce`, `.transform()`, `.default()`) is not
 * idempotent: the second pass corrupts or rejects the first's output.
 * That was the defect behind issue #83; failing at boot beats a green
 * suite that passes the same body through two validators.
 */
@Injectable()
export class SchemaValidatorConflictCheck implements OnApplicationBootstrap {
  constructor(private readonly applicationConfig: ApplicationConfig) {}

  onApplicationBootstrap(): void {
    const global = this.applicationConfig
      .getGlobalPipes()
      .filter((pipe) => pipe instanceof StandardSchemaValidationPipe);
    if (global.length === 0) return;
    throw new Error(
      'Rockets: a global StandardSchemaValidationPipe is registered ' +
        '(app.useGlobalPipes(...) or an APP_PIPE provider). Rockets routes ' +
        'carry their own per-route Standard Schema pipe, so a global one ' +
        'validates every body twice and breaks transforming schemas. Remove ' +
        'it; hand-written controllers use ' +
        '@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation)) ' +
        'at class level instead.',
    );
  }
}
