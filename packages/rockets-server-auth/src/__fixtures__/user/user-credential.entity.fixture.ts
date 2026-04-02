import { Column, Entity } from 'typeorm';
import { UserPasswordHistorySqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { ReferenceActive } from '@concepta/nestjs-common';

@Entity()
export class UserCredentialEntityFixture extends UserPasswordHistorySqliteEntity {
  @Column({ type: 'boolean', default: true })
  active!: ReferenceActive;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  validFrom!: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  validTo!: Date | null;
}
