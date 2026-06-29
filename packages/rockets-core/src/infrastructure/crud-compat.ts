/**
 * Compat re-exports for nestjs-crud types that exist in the dist
 * but are not yet exported from the package index.
 *
 * Once upstream adds these to its index, remove this file and import from
 * nestjs-crud directly.
 */

export type { CrudRequestConfig } from '@concepta/nestjs-crud/dist/infrastructure/request/interfaces/crud-request-config.interface';
export type { CrudResponseConfig } from '@concepta/nestjs-crud/dist/infrastructure/request/interfaces/crud-response-config.interface';
export type { CrudParamOptionInterface } from '@concepta/nestjs-crud/dist/infrastructure/interfaces/crud-param-option.interface';
export { CrudMetaview } from '@concepta/nestjs-crud/dist/infrastructure/services/crud-metaview.service';
