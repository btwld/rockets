import { AuthRouterOptionsExtrasInterface } from '@concepta/nestjs-auth-router';
import { CrudAdapter } from '@concepta/nestjs-crud';
import { RoleOptionsExtrasInterface } from '@concepta/nestjs-role/dist/interfaces/role-options-extras.interface';
import { DynamicModule, Type } from '@nestjs/common';
import { RocketsServerUserEntityInterface } from './user/rockets-server-user-entity.interface';

export interface AdminOptionsExtrasInterface {
  imports?: DynamicModule['imports'];
  path?: string;
  model: Type;
  adapter: Type<CrudAdapter<RocketsServerUserEntityInterface>>;
  dto?: {
    createOne?: Type;
    createMany?: Type;
    updateOne?: Type;
    replaceOne?: Type;
  };
}

export interface RocketsServerOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  user?: { imports: DynamicModule['imports'] };
  otp?: { imports: DynamicModule['imports'] };
  federated?: { imports: DynamicModule['imports'] };
  role?: RoleOptionsExtrasInterface & { imports: DynamicModule['imports'] };
  authRouter?: AuthRouterOptionsExtrasInterface;
  admin?: AdminOptionsExtrasInterface;
}
