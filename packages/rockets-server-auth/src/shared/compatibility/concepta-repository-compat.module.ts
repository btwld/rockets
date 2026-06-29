import { Global, Module } from '@nestjs/common';

/**
 * Compat shim — previously bridged @bitwild/rockets-repository TransactionScope
 * to @concepta/nestjs-repository token. Now that both come from the same package,
 * the bridge is a no-op: RepositoryModule.forRoot({}) already provides and exports
 * TransactionScope globally.
 */
@Global()
@Module({})
export class ConceptaRepositoryCompatModule {}
