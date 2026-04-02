import { Type } from '@nestjs/common';
import { IQueryHandler, ICommandHandler } from '@nestjs/cqrs';
import { RocketsGetUserByEmailQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-email.query';
import { RocketsGetUserByUsernameQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-username.query';
import { RocketsGetUserBySubjectQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-subject.query';
import { RocketsGetUserByIdQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-id.query';
import { RocketsCreateUserCommand } from '../../domains/user/application/commands/impl/rockets-create-user.command';
import { RocketsUpdateUserCommand } from '../../domains/user/application/commands/impl/rockets-update-user.command';
import { GetActiveCredentialQuery } from '../../domains/user/application/queries/impl/get-active-credential.query';
import { RocketsCreateOtpCommand } from '../../domains/otp/application/commands/impl/rockets-create-otp.command';
import { RocketsValidateOtpQuery } from '../../domains/otp/application/queries/impl/rockets-validate-otp.query';
import { RocketsClearOtpsCommand } from '../../domains/otp/application/commands/impl/rockets-clear-otps.command';

export interface RocketsAuthUserPortHandlersInterface {
  getUserByEmail?: Type<IQueryHandler<RocketsGetUserByEmailQuery>>;
  getUserByUsername?: Type<IQueryHandler<RocketsGetUserByUsernameQuery>>;
  getUserBySubject?: Type<IQueryHandler<RocketsGetUserBySubjectQuery>>;
  getUserById?: Type<IQueryHandler<RocketsGetUserByIdQuery>>;
  createUser?: Type<ICommandHandler<RocketsCreateUserCommand>>;
  updateUser?: Type<ICommandHandler<RocketsUpdateUserCommand>>;
  getActiveCredential?: Type<IQueryHandler<GetActiveCredentialQuery>>;
}

export interface RocketsAuthOtpPortHandlersInterface {
  createOtp?: Type<ICommandHandler<RocketsCreateOtpCommand>>;
  validateOtp?: Type<IQueryHandler<RocketsValidateOtpQuery>>;
  clearOtps?: Type<ICommandHandler<RocketsClearOtpsCommand>>;
}

export interface RocketsAuthPortsConfigInterface {
  user?: {
    handlers?: RocketsAuthUserPortHandlersInterface;
  };
  otp?: {
    handlers?: RocketsAuthOtpPortHandlersInterface;
  };
}
