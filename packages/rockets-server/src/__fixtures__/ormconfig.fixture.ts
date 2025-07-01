import { DataSourceOptions } from 'typeorm';
import { UserFixture } from './user/user.entity.fixture';
import { UserProfileEntityFixture } from './user/user-profile.entity.fixture';
import { UserPasswordHistoryEntityFixture } from './user/user-password-history.entity.fixture';
import { UserOtpEntityFixture } from './user/user-otp-entity.fixture';
import { FederatedEntityFixture } from './federated/federated.entity.fixture';

export const ormConfig: DataSourceOptions = {
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  entities: [
    UserFixture,
    UserProfileEntityFixture,
    UserPasswordHistoryEntityFixture,
    UserOtpEntityFixture,
    FederatedEntityFixture,
  ],
};
