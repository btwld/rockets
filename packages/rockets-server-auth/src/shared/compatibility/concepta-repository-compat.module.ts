import { TransactionScope as ConceptaTransactionScope } from '@concepta/nestjs-repository';
import { TransactionScope as BitwildTransactionScope } from '@bitwild/rockets-repository';
import { Global, Module } from '@nestjs/common';

/**
 * Until upstream `@concepta/nestjs-*` motors are ported to `@bitwild/*`,
 * their DI tokens still reference `@concepta/nestjs-repository` classes.
 * Re-export the live {@link BitwildTransactionScope} instance under the
 * Concepta token so Invitation/User modules can resolve transactions.
 */
@Global()
@Module({
  providers: [
    {
      provide: ConceptaTransactionScope,
      useExisting: BitwildTransactionScope,
    },
  ],
  exports: [ConceptaTransactionScope],
})
export class ConceptaRepositoryCompatModule {}
