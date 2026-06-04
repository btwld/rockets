import { Column, Entity } from 'typeorm';
import { UserPasswordHistorySqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { ReferenceActive } from '@bitwild/rockets-app';

/**
 * Password credentials row for nestjs-user v8 (`CreateUserCredentialCommand`).
 * Register in TypeOrmExt `forFeature` with key `USER_CREDENTIALS_ENTITY_KEY`.
 */
@Entity()
export class UserCredentialEntity extends UserPasswordHistorySqliteEntity {
  @Column({ type: 'boolean', default: true })
  active!: ReferenceActive;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  validFrom!: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  validTo!: Date | null;
}
