import {
  FirebaseAuthAdapter,
  FirebaseAuthModule,
} from '@bitwild/rockets-adapter-firebase';
import {
  defineModuleResource,
  ROCKETS_AUTH_INTEGRATION_KIND,
} from '@bitwild/rockets-core';
import type { RocketsAuthIntegration } from '@bitwild/rockets-core';

import { UserEntity } from '../auth/user.entity';

import { resolveFirebaseAuthModuleOptions } from './resolve-firebase-auth-options';

export function defineFirebaseAuth(): RocketsAuthIntegration {
  return {
    kind: ROCKETS_AUTH_INTEGRATION_KIND,
    nestImports: [
      FirebaseAuthModule.forRootAsync({
        useFactory: resolveFirebaseAuthModuleOptions,
      }),
    ],
    authAdapter: FirebaseAuthAdapter,
    authProviderExternallyManaged: true,
    resources: [defineModuleResource({ entities: [UserEntity] })],
  };
}
