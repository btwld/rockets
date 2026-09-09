import type { PlainLiteralObject, Type } from '@nestjs/common';
import type {
  CrudRequestConfig,
  CrudResponseConfig,
} from '@concepta/nestjs-crud';
import type { OperationAclConfig } from '../../../domain/interfaces/resource-acl.interface';

export interface InternalOperationOverride {
  /** Raw per-operation `acl`, resolved against the resource-level one. */
  acl?: OperationAclConfig;
  query?: Type;
  command?: Type;
  request?: CrudRequestConfig<PlainLiteralObject>;
  response?: CrudResponseConfig;
  extraDecorators?: readonly (MethodDecorator | ClassDecorator)[];
  transactional?: boolean;
  path?: string | string[];
  methodName?: string;
  hooks?: readonly Type[];
}
