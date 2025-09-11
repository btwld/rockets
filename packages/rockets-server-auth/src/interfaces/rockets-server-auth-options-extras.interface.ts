import { AuthRouterOptionsExtrasInterface } from '@concepta/nestjs-auth-router';
import { CrudAdapter } from '@concepta/nestjs-crud';
import { RoleOptionsExtrasInterface } from '@concepta/nestjs-role/dist/interfaces/role-options-extras.interface';
import { DynamicModule, Type } from '@nestjs/common';
import { RocketsServerAuthUserEntityInterface } from './user/rockets-server-auth-user-entity.interface';
import { RocketsServerAuthUserCreatableInterface } from './user/rockets-server-auth-user-creatable.interface';
import { RocketsServerAuthUserUpdatableInterface } from './user/rockets-server-auth-user-updatable.interface';

export interface UserCrudOptionsExtrasInterface {
  imports?: DynamicModule['imports'];
  path?: string;
  model: Type;
  adapter: Type<CrudAdapter<RocketsServerAuthUserEntityInterface>>;
  dto?: {
    createOne?: Type<RocketsServerAuthUserCreatableInterface>;
    updateOne?: Type<RocketsServerAuthUserUpdatableInterface>;
  };
}

export interface DisableControllerOptionsInterface {
  password?: boolean; // true = disabled
  refresh?: boolean; // true = disabled
  recovery?: boolean; // true = disabled
  otp?: boolean; // true = disabled
  oAuth?: boolean; // true = disabled
  signup?: boolean; // true = disabled (admin submodule)
  admin?: boolean; // true = disabled (admin submodule)
  user?: boolean; // true = disabled (user submodule)
}

export interface RocketsServerAuthOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  user?: { imports: DynamicModule['imports'] };
  otp?: { imports: DynamicModule['imports'] };
  federated?: { imports: DynamicModule['imports'] };
  role?: RoleOptionsExtrasInterface & { imports: DynamicModule['imports'] };
  authRouter?: AuthRouterOptionsExtrasInterface;
  userCrud?: UserCrudOptionsExtrasInterface;
  disableController?: DisableControllerOptionsInterface;
}
