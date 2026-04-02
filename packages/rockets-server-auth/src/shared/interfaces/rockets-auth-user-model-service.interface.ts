import {
  ReferenceIdInterface,
  ReferenceSubject,
  UserEntityInterface,
} from '@concepta/nestjs-common';

/**
 * User model service interface for Rockets Auth.
 *
 * Defines the user lookup methods required by various auth modules.
 * Replaces the removed UserModelServiceInterface from nestjs-user v8.
 */
export interface RocketsAuthUserModelServiceInterface {
  bySubject(subject: ReferenceSubject): Promise<ReferenceIdInterface | null>;
  byId(id: string): Promise<UserEntityInterface | null>;
  byEmail(email: string): Promise<UserEntityInterface | null>;
  byUsername(username: string): Promise<UserEntityInterface | null>;
  update(
    data: Partial<UserEntityInterface> & { id: string },
  ): Promise<UserEntityInterface | null>;
  create(
    data: Partial<UserEntityInterface>,
  ): Promise<UserEntityInterface | null>;
  find(options: {
    where: Record<string, unknown>;
  }): Promise<UserEntityInterface[]>;
}
