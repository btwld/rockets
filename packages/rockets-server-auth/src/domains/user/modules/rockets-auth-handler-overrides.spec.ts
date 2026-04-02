import { Injectable, PlainLiteralObject } from '@nestjs/common';
import { AbstractSignupUserHandler } from '../application/commands/handlers/abstract-signup-user.handler';
import { AbstractAdminUserListHandler } from '../application/commands/handlers/abstract-admin-user-list.handler';
import { AbstractAdminUserReadHandler } from '../application/commands/handlers/abstract-admin-user-read.handler';
import { AbstractAdminUserUpdateHandler } from '../application/commands/handlers/abstract-admin-user-update.handler';
import { AbstractAdminDeleteUserHandler } from '../application/commands/handlers/abstract-admin-delete-user.handler';
import { SignupUserHandler } from '../application/commands/handlers/signup-user.handler';
import { AdminUserListHandler } from '../application/queries/handlers/admin-user-list.handler';
import { AdminUserReadHandler } from '../application/queries/handlers/admin-user-read.handler';
import { AdminUpdateUserHandler } from '../application/commands/handlers/admin-update-user.handler';
import { AdminDeleteUserHandler } from '../application/commands/handlers/admin-delete-user.handler';
import { RocketsAuthSignUpModule } from './rockets-auth-signup.module';
import { RocketsAuthAdminModule } from './rockets-auth-admin.module';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { SignupUserCommand } from '../application/commands/impl/signup-user.command';
import {
  CrudAdapter,
  CrudResponsePaginatedInterface,
} from '@concepta/nestjs-crud';
import type { CrudQueryInterface } from '@concepta/nestjs-crud/dist/application/queries/interfaces/crud-query.interface';
import type { CrudCommandInterface } from '@concepta/nestjs-crud/dist/application/commands/interfaces/crud-command.interface';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';

/**
 * Test doubles for override registration checks only (no Nest bootstrap).
 * Real custom handlers must use @Injectable + @InjectCrudAdapter like AdminUserListHandler.
 */
class CustomAdminListHandler extends AbstractAdminUserListHandler {
  readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface> =
    {} as CrudAdapter<RocketsAuthUserEntityInterface>;

  async execute(
    query: CrudQueryInterface<RocketsAuthUserEntityInterface>,
  ): Promise<
    | RocketsAuthUserEntityInterface
    | CrudResponsePaginatedInterface<RocketsAuthUserEntityInterface>
  > {
    return this.crudAdapter.list(query.context);
  }
}

class CustomAdminReadHandler extends AbstractAdminUserReadHandler {
  readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface> =
    {} as CrudAdapter<RocketsAuthUserEntityInterface>;

  async execute(
    query: CrudQueryInterface<RocketsAuthUserEntityInterface>,
  ): Promise<
    | (RocketsAuthUserEntityInterface & PlainLiteralObject)
    | CrudResponsePaginatedInterface<RocketsAuthUserEntityInterface>
  > {
    return this.crudAdapter.read(query.context);
  }
}

describe('Handler Override Pattern', () => {
  // ─── Signup ────────────────────────────────────────────────

  describe('SignupModule.register() with signupHandler override', () => {
    class CustomSignupHandler extends AbstractSignupUserHandler {
      async execute(
        _command: SignupUserCommand,
      ): Promise<RocketsAuthUserEntityInterface> {
        return { id: 'overridden' } as RocketsAuthUserEntityInterface;
      }
    }

    it('should use default handler when signupHandler not provided', () => {
      const config: UserCrudOptionsExtrasInterface = {};
      const module = RocketsAuthSignUpModule.register(config);
      const providerClasses = (module.providers as { useClass?: unknown }[])
        ?.map((p) =>
          typeof p === 'function' ? p : (p as { useClass?: unknown }).useClass,
        )
        .filter(Boolean);
      expect(providerClasses).toContain(SignupUserHandler);
    });

    it('should use custom handler when signupHandler provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: {
          signupHandler: CustomSignupHandler,
        },
      };
      const module = RocketsAuthSignUpModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === CustomSignupHandler || p === SignupUserHandler,
      );
      expect(providerClasses).toContain(CustomSignupHandler);
    });

    it('should not include default handler when custom handler provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: {
          signupHandler: CustomSignupHandler,
        },
      };
      const module = RocketsAuthSignUpModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === SignupUserHandler,
      );
      expect(providerClasses).toHaveLength(0);
    });
  });

  // ─── Admin List ────────────────────────────────────────────

  describe('AdminModule.register() with adminList override', () => {
    it('should use default list handler when not provided', () => {
      const config: UserCrudOptionsExtrasInterface = {};
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === AdminUserListHandler,
      );
      expect(providerClasses).toHaveLength(1);
    });

    it('should use custom list handler when provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: { adminList: CustomAdminListHandler },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === CustomAdminListHandler || p === AdminUserListHandler,
      );
      expect(providerClasses).toContain(CustomAdminListHandler);
    });

    it('should not include default list handler when custom provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: { adminList: CustomAdminListHandler },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === AdminUserListHandler,
      );
      expect(providerClasses).toHaveLength(0);
    });
  });

  // ─── Admin Read ────────────────────────────────────────────

  describe('AdminModule.register() with adminRead override', () => {
    it('should use default read handler when not provided', () => {
      const config: UserCrudOptionsExtrasInterface = {};
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === AdminUserReadHandler,
      );
      expect(providerClasses).toHaveLength(1);
    });

    it('should use custom read handler when provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: { adminRead: CustomAdminReadHandler },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === CustomAdminReadHandler || p === AdminUserReadHandler,
      );
      expect(providerClasses).toContain(CustomAdminReadHandler);
    });

    it('should not include default read handler when custom provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: { adminRead: CustomAdminReadHandler },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === AdminUserReadHandler,
      );
      expect(providerClasses).toHaveLength(0);
    });
  });

  describe('AdminModule.register() with adminList and adminRead both overridden', () => {
    it('should register only custom list and read handlers, not defaults', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: {
          adminList: CustomAdminListHandler,
          adminRead: CustomAdminReadHandler,
        },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providers = module.providers as unknown[];
      expect(providers).toEqual(
        expect.arrayContaining([
          CustomAdminListHandler,
          CustomAdminReadHandler,
        ]),
      );
      expect(providers.filter((p) => p === AdminUserListHandler)).toHaveLength(
        0,
      );
      expect(providers.filter((p) => p === AdminUserReadHandler)).toHaveLength(
        0,
      );
    });
  });

  // ─── Admin Update ──────────────────────────────────────────

  describe('AdminModule.register() with adminUpdate override', () => {
    @Injectable()
    class CustomAdminUpdateHandler extends AbstractAdminUserUpdateHandler {
      async execute(
        _command: CrudCommandInterface<RocketsAuthUserEntityInterface>,
      ): Promise<RocketsAuthUserEntityInterface> {
        return { id: 'overridden' } as RocketsAuthUserEntityInterface;
      }
    }

    it('should use default update handler when not provided', () => {
      const config: UserCrudOptionsExtrasInterface = {};
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === AdminUpdateUserHandler,
      );
      expect(providerClasses).toHaveLength(1);
    });

    it('should use custom update handler when provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: { adminUpdate: CustomAdminUpdateHandler },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === CustomAdminUpdateHandler || p === AdminUpdateUserHandler,
      );
      expect(providerClasses).toContain(CustomAdminUpdateHandler);
    });

    it('should not include default update handler when custom provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: { adminUpdate: CustomAdminUpdateHandler },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === AdminUpdateUserHandler,
      );
      expect(providerClasses).toHaveLength(0);
    });
  });

  // ─── Admin Delete ──────────────────────────────────────────

  describe('AdminModule.register() with adminDelete override', () => {
    @Injectable()
    class CustomAdminDeleteHandler extends AbstractAdminDeleteUserHandler {
      async execute(
        _command: CrudCommandInterface<RocketsAuthUserEntityInterface>,
      ): Promise<RocketsAuthUserEntityInterface | null> {
        return null;
      }
    }

    it('should use default delete handler when not provided', () => {
      const config: UserCrudOptionsExtrasInterface = {};
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === AdminDeleteUserHandler,
      );
      expect(providerClasses).toHaveLength(1);
    });

    it('should use custom delete handler when provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: { adminDelete: CustomAdminDeleteHandler },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === CustomAdminDeleteHandler || p === AdminDeleteUserHandler,
      );
      expect(providerClasses).toContain(CustomAdminDeleteHandler);
    });

    it('should not include default delete handler when custom provided', () => {
      const config: UserCrudOptionsExtrasInterface = {
        handlers: { adminDelete: CustomAdminDeleteHandler },
      };
      const module = RocketsAuthAdminModule.register(config);
      const providerClasses = (module.providers as unknown[])?.filter(
        (p) => p === AdminDeleteUserHandler,
      );
      expect(providerClasses).toHaveLength(0);
    });
  });

  // ─── Ports Module Handler Overrides ─────────────────────────

  describe('RocketsAuthPortsModule.forRoot() handler overrides', () => {
    // Lazily import to avoid circular deps in test setup
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      RocketsAuthPortsModule,
    } = require('../../../shared/ports/rockets-auth-ports.module');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      RocketsGetUserByEmailHandler,
    } = require('../application/queries/handlers/rockets-get-user-by-email.handler');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      RocketsCreateOtpHandler,
    } = require('../../../domains/otp/application/commands/handlers/rockets-create-otp.handler');

    @Injectable()
    class CustomGetUserByEmailHandler {
      async execute(): Promise<null> {
        return null;
      }
    }

    @Injectable()
    class CustomCreateOtpHandler {
      async execute(): Promise<null> {
        return null;
      }
    }

    it('should use default handlers when no overrides provided', () => {
      const module = RocketsAuthPortsModule.forRoot();
      const providers = module.providers as unknown[];
      expect(providers).toContain(RocketsGetUserByEmailHandler);
      expect(providers).toContain(RocketsCreateOtpHandler);
    });

    it('should use custom user handler when override provided', () => {
      const module = RocketsAuthPortsModule.forRoot({
        user: {
          handlers: {
            getUserByEmail: CustomGetUserByEmailHandler,
          },
        },
      });
      const providers = module.providers as unknown[];
      expect(providers).toContain(CustomGetUserByEmailHandler);
      expect(providers).not.toContain(RocketsGetUserByEmailHandler);
    });

    it('should use custom otp handler when override provided', () => {
      const module = RocketsAuthPortsModule.forRoot({
        otp: {
          handlers: {
            createOtp: CustomCreateOtpHandler,
          },
        },
      });
      const providers = module.providers as unknown[];
      expect(providers).toContain(CustomCreateOtpHandler);
      expect(providers).not.toContain(RocketsCreateOtpHandler);
    });

    it('should keep other default handlers when only one is overridden', () => {
      const module = RocketsAuthPortsModule.forRoot({
        user: {
          handlers: {
            getUserByEmail: CustomGetUserByEmailHandler,
          },
        },
      });
      const providers = module.providers as unknown[];
      expect(providers).toContain(CustomGetUserByEmailHandler);
      expect(providers).toContain(RocketsCreateOtpHandler);
    });

    it('should export all providers', () => {
      const module = RocketsAuthPortsModule.forRoot();
      expect(module.exports).toEqual(module.providers);
    });

    it('should be global', () => {
      const module = RocketsAuthPortsModule.forRoot();
      expect(module.global).toBe(true);
    });
  });
});
