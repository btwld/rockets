import { DependenciesScanner } from '@nestjs/core/scanner';
import { CrudModule } from '@concepta/nestjs-crud';

/**
 * E2e-only fixes for Nest module scanning:
 * 1. Skip nullish export slots (some upstream DynamicModules yield sparse arrays).
 * 2. Sanitize CrudModule.forFeature `exports` so they mirror filtered `providers`.
 */

let patched = false;

if (!patched) {
  patched = true;

  const scanInsert =
    DependenciesScanner.prototype.insertExportedProviderOrModule;
  DependenciesScanner.prototype.insertExportedProviderOrModule = function (
    toExport: unknown,
    token: unknown,
  ): void {
    if (toExport === undefined || toExport === null) {
      return;
    }
    return scanInsert.call(this, toExport, token);
  };

  const originalCrud = CrudModule.forFeature.bind(CrudModule);
  CrudModule.forFeature = ((options) => {
    const feature = originalCrud(options);
    const providers = (feature.providers ?? []).filter(
      (p): p is NonNullable<(typeof feature.providers)[number]> => p != null,
    );
    const ctrls = feature.controllers;
    const controllers = Array.isArray(ctrls)
      ? ctrls.filter((c): c is NonNullable<(typeof ctrls)[number]> => c != null)
      : ctrls;

    return {
      ...feature,
      providers,
      exports: providers,
      controllers,
    };
  }) as typeof CrudModule.forFeature;
}
