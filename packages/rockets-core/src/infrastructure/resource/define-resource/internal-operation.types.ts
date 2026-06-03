import type { PlainLiteralObject, Type } from '@nestjs/common';
import type {
  CrudRequestConfig,
  CrudResponseConfig,
} from '@bitwild/rockets-crud';

export interface InternalOperationOverride {
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
