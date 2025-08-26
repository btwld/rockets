import { AuthRouterOptionsExtrasInterface } from '@concepta/nestjs-auth-router';
import { CrudAdapter } from '@concepta/nestjs-crud';
import { RoleOptionsExtrasInterface } from '@concepta/nestjs-role/dist/interfaces/role-options-extras.interface';
import { DynamicModule, Type } from '@nestjs/common';
import { RocketsServerUserEntityInterface } from './user/rockets-server-user-entity.interface';
import { RocketsServerUserCreatableInterface } from './user/rockets-server-user-creatable.interface';
import { RocketsServerUserUpdatableInterface } from './user/rockets-server-user-updatable.interface';

export interface UserCrudOptionsExtrasInterface {
  imports?: DynamicModule['imports'];
  path?: string;
  model: Type;
  adapter: Type<CrudAdapter<RocketsServerUserEntityInterface>>;
  dto?: {
    createOne?: Type<RocketsServerUserCreatableInterface>;
    updateOne?: Type<RocketsServerUserUpdatableInterface>;
  };
}

export interface RocketsServerOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  user?: { imports: DynamicModule['imports'] };
  otp?: { imports: DynamicModule['imports'] };
  federated?: { imports: DynamicModule['imports'] };
  role?: RoleOptionsExtrasInterface & { imports: DynamicModule['imports'] };
  authRouter?: AuthRouterOptionsExtrasInterface;
  userCrud?: UserCrudOptionsExtrasInterface;
}
