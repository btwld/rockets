import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
  Type,
} from '@nestjs/common';
import { IEventHandler } from '@nestjs/cqrs';
import { InvitationAcceptedEvent } from '@concepta/nestjs-invitation';

import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { buildInvitationAcceptanceController } from '../gateways/http/factories/build-invitation-controllers';
import { InvitationAcceptanceControllerExtras } from '../interfaces/invitation-controller-extras.interface';
import { InvitationUserAcceptanceListener } from '../application/listeners/invitation-user-acceptance.listener';
import {
  INVITATION_ACCEPTANCE_CONFIG_TOKEN,
  InvitationAcceptanceConfig,
} from '../infrastructure/config/invitation-acceptance.config';

export const RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_INVITATION_ACCEPTANCE_MODULE_RAW_OPTIONS_TOKEN__',
);

export const INVITATION_ACCEPTANCE_LISTENER_TOKEN =
  'INVITATION_ACCEPTANCE_LISTENER';

export type InvitationAcceptedEventHandler = Type<
  IEventHandler<InvitationAcceptedEvent>
>;

/**
 * Options interface for Invitation Acceptance Module
 */
export interface InvitationAcceptanceOptionsInterface {
  userCrud?: UserCrudOptionsExtrasInterface;
  /** Override {@link InvitationUserAcceptanceListener} with your own CQRS event handler. */
  listenerService?: InvitationAcceptedEventHandler;
  /** Acceptance controller customization (decorators, hooks). */
  controller?: InvitationAcceptanceControllerExtras;
}

type InvitationAcceptanceExtrasInterface =
  InvitationAcceptanceOptionsInterface & {
    global?: boolean;
  };

export const {
  ConfigurableModuleClass: RocketsAuthInvitationAcceptanceModuleClass,
  OPTIONS_TYPE: ROCKETS_AUTH_INVITATION_ACCEPTANCE_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE:
    ROCKETS_AUTH_INVITATION_ACCEPTANCE_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<InvitationAcceptanceOptionsInterface>({
  moduleName: 'RocketsAuthInvitationAcceptance',
  optionsInjectionToken: RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
})
  .setExtras<Partial<InvitationAcceptanceExtrasInterface>>(
    { global: false },
    definitionTransform,
  )
  .build();

export type RocketsAuthInvitationAcceptanceOptions =
  typeof ROCKETS_AUTH_INVITATION_ACCEPTANCE_MODULE_OPTIONS_TYPE;
export type RocketsAuthInvitationAcceptanceAsyncOptions =
  typeof ROCKETS_AUTH_INVITATION_ACCEPTANCE_MODULE_ASYNC_OPTIONS_TYPE;

function definitionTransform(
  definition: DynamicModule,
  extras: Partial<InvitationAcceptanceExtrasInterface>,
): DynamicModule {
  // Rename to avoid shadowing the CJS `exports` object — TypeScript compiles
  // module-level `export const X` references to `exports.X`, which the local
  // destructured `exports` array would intercept and resolve to `undefined`.
  const { providers = [], exports: defExports = [] } = definition;

  return {
    ...definition,
    global: extras.global,
    controllers: [buildInvitationAcceptanceController(extras.controller)],
    providers: createInvitationAcceptanceProviders({ providers, extras }),
    exports: [
      ...defExports,
      RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
      INVITATION_ACCEPTANCE_LISTENER_TOKEN,
    ],
  };
}

function createInvitationAcceptanceProviders(options: {
  providers: Provider[];
  extras?: Partial<InvitationAcceptanceExtrasInterface>;
}): Provider[] {
  const { extras } = options;
  const ListenerClass =
    extras?.listenerService ?? InvitationUserAcceptanceListener;

  return [
    ...options.providers,
    {
      provide: INVITATION_ACCEPTANCE_CONFIG_TOKEN,
      inject: [RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN],
      useFactory: (
        opts: InvitationAcceptanceOptionsInterface,
      ): InvitationAcceptanceConfig => ({
        userMetadataUpdateDto: opts.userCrud?.userMetadataConfig?.updateDto,
      }),
    },
    ListenerClass,
    {
      provide: INVITATION_ACCEPTANCE_LISTENER_TOKEN,
      useExisting: ListenerClass,
    },
  ];
}
