import { Injectable } from '@nestjs/common';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { UserProfileEntityFixture } from '../user/user-profile.entity.fixture';

@Injectable()
export class UserProfileTypeOrmCrudAdapterFixture extends TypeOrmCrudAdapter<UserProfileEntityFixture> {
  // This is a fixture adapter for testing purposes
  // In a real application, this would be properly configured with a repository
}
