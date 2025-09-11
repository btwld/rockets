import { Entity } from 'typeorm';
import { UserPasswordHistorySqliteEntity } from '@concepta/nestjs-typeorm-ext';

@Entity()
export class UserPasswordHistoryEntityFixture extends UserPasswordHistorySqliteEntity {}
