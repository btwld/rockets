import { SetMetadata } from '@nestjs/common';
import { ROCKETS_DISABLE_GUARDS_TOKEN } from '../rockets-core.constants';

export const AuthPublic = () =>
  SetMetadata(ROCKETS_DISABLE_GUARDS_TOKEN, true);
