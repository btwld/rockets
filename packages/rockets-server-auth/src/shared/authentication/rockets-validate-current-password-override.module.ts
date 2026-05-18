import { Global, Module } from '@nestjs/common';
import { ValidateCurrentPasswordHandler } from '@concepta/nestjs-password';

import { RocketsValidateCurrentPasswordHandler } from './rockets-validate-current-password.handler';

/**
 * Overrides upstream {@link ValidateCurrentPasswordHandler} so bcrypt receives a
 * plain `{ passwordHash }` for domain aggregates. Import after {@link PasswordModule}.
 */
@Global()
@Module({
  providers: [
    {
      provide: ValidateCurrentPasswordHandler,
      useClass: RocketsValidateCurrentPasswordHandler,
    },
  ],
})
export class RocketsValidateCurrentPasswordOverrideModule {}
