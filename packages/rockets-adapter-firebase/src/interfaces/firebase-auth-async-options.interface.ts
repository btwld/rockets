import { ModuleMetadata, Type } from '@nestjs/common';

import { FirebaseAuthModuleOptions } from './firebase-auth-options.interface';

export interface FirebaseAuthModuleOptionsFactory {
  createFirebaseAuthModuleOptions():
    | Promise<FirebaseAuthModuleOptions>
    | FirebaseAuthModuleOptions;
}

export interface FirebaseAuthModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  readonly useExisting?: Type<FirebaseAuthModuleOptionsFactory>;
  readonly useClass?: Type<FirebaseAuthModuleOptionsFactory>;
  readonly useFactory?: (
    ...args: readonly unknown[]
  ) => Promise<FirebaseAuthModuleOptions> | FirebaseAuthModuleOptions;
  readonly inject?: any[];
}
