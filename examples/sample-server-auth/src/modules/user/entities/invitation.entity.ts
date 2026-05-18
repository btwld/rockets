import { Entity } from 'typeorm';
import { InvitationSqliteEntity } from '@concepta/nestjs-typeorm-ext';

/**
 * Invitation entity for SQLite
 * Extends the base invitation entity from nestjs-typeorm-ext
 */
@Entity()
export class InvitationEntity extends InvitationSqliteEntity {}
