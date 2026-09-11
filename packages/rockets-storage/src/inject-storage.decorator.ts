import { Inject } from '@nestjs/common';

import { DEFAULT_STORAGE_NAME, getStorageToken } from './storage.tokens.js';

export function InjectStorage(
  name: string = DEFAULT_STORAGE_NAME,
): ParameterDecorator & PropertyDecorator {
  return Inject(getStorageToken(name));
}
