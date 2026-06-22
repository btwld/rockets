import { PlainLiteralObject } from '@nestjs/common';

import { EntityColumn } from '@bitwild/rockets-repository';

// Mirrors @nestjs/swagger's SwaggerEnumType, which is not exposed from the
// package's public entry (its `exports` map blocks the deep `/dist` path).
type SwaggerEnumType =
  | string[]
  | number[]
  | boolean[]
  | (string | number | boolean)[]
  | Record<number, string>;

export interface CrudParamOptionInterface<T extends PlainLiteralObject> {
  field?: EntityColumn<T>;
  type?: 'number' | 'string' | 'uuid';
  enum?: SwaggerEnumType;
  primary?: boolean;
  disabled?: boolean;
}
