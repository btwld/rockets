import { Body, ValidationPipe } from '@nestjs/common';
import { MetadataScanner } from '@nestjs/core';

import { CRUD_MODULE_DEFAULT_VALIDATION_PIPE_OPTIONS } from '../../../crud.constants';
import {
  CrudStandardSchemaValidationPipe,
  getStandardSchema,
} from '../../pipes/crud-standard-schema-validation.pipe';
import { CrudMetaview } from '../../services/crud-metaview.service';

/**
 * Crud initialize validation decorator.
 *
 * Add a ValidationPipe to every parameter called with the `CrudBody` decorator.
 *
 * When the route's `expectedType` DTO carries a Standard Schema (static
 * `schema` property — e.g. `nestjs-zod` DTOs), the schema owns the body
 * contract: a `CrudStandardSchemaValidationPipe` validates, strips and
 * coerces with full fidelity and the class-validator pipe is NOT
 * installed — such DTO classes carry no class-validator/transformer
 * metadata, so the default `excludeAll` transform would empty the body.
 */
export const CrudInitValidation = (): ClassDecorator => (classTarget) => {
  const reflectionService = new CrudMetaview();
  const scanner = new MetadataScanner();
  const prototype = classTarget.prototype;

  // get the fallback validation options
  const fallbackOptions = reflectionService.getValidationOptions(classTarget);

  for (const methodName of scanner.getAllMethodNames(prototype)) {
    const handler = Reflect.get(prototype, methodName);

    // get the body param options for this method
    const bodyParamOptions = reflectionService.getBodyParamOptions(handler);
    if (!bodyParamOptions?.length) continue;

    // loop all metadatas and set up the pipe
    for (const metadata of bodyParamOptions) {
      let { pipes = [] } = metadata;
      const { validation = fallbackOptions } = metadata;

      // are we injecting validation?
      if (validation !== false) {
        // yes, merge options
        const finalOptions = {
          ...CRUD_MODULE_DEFAULT_VALIDATION_PIPE_OPTIONS,
          ...validation,
        };

        const standardSchema = getStandardSchema(finalOptions.expectedType);
        if (standardSchema !== undefined) {
          pipes = [
            new CrudStandardSchemaValidationPipe(standardSchema),
            ...pipes,
          ];
        } else {
          pipes = [new ValidationPipe(finalOptions), ...pipes];
        }
      }

      // create the body decorator
      Body(...pipes)(prototype, methodName, metadata.parameterIndex);
    }
  }
};
