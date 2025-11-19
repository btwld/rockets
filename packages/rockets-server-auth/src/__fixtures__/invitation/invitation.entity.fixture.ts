import { Entity } from 'typeorm';
import { InvitationSqliteEntity } from '@concepta/nestjs-typeorm-ext';

@Entity()
export class InvitationEntityFixture extends InvitationSqliteEntity {}
