import { describe, it, expect, vi } from 'vitest';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import {
  RocketsCoreModule,
  ROCKETS_CORE_SETTINGS_TOKEN,
  withOpenApi,
  type AuthAdapterInterface,
  type AuthAttemptResult,
  type AuthBootstrap,
  type AuthRequest,
  type RepositoryModuleInterface,
  type ResourceInput,
  type RocketsUserMetadataConfig,
} from '@concepta/rockets-core';
import {
  createRocketsControllers,
  createRocketsImports,
  createRocketsProviders,
  createRocketsExports,
  resolveRocketsComposition,
} from './rockets.module-definition';
import { RAW_OPTIONS_TOKEN } from './rockets.tokens';

class ContributedAuthAdapter implements AuthAdapterInterface {
  authenticate(_request: AuthRequest): Promise<AuthAttemptResult> {
    return Promise.resolve({ matched: false });
  }
}
class ContributedMetadataEntity {}

const contributedRepository = {
  forFeature: vi.fn(),
} as unknown as RepositoryModuleInterface;
const contributedResource = {
  key: 'auth-resource',
} as unknown as ResourceInput;
const contributedUserMetadata: RocketsUserMetadataConfig = {
  entity: ContributedMetadataEntity,
  updateSchema: withOpenApi(
    z.object({ firstName: z.string().optional() }),
    'ContributedMetadataUpdateDto',
  ),
  responseSchema: withOpenApi(
    z.object({ id: z.string(), userId: z.string() }),
    'ContributedMetadataResponseDto',
  ),
};

function contributedAuth(
  overrides: {
    identity?: Record<string, unknown>;
    contributes?: Record<string, unknown>;
  } = {},
): AuthBootstrap {
  return {
    adapter: ContributedAuthAdapter,
    identity: {
      repository: contributedRepository,
      resources: [contributedResource],
      userMetadata: contributedUserMetadata,
      ...overrides.identity,
    },
    contributes: {
      enableGlobalGuard: false,
      providesAppGuard: true,
      ...overrides.contributes,
    },
  } as AuthBootstrap;
}

describe('RocketsModuleDefinition', () => {
  describe('createRocketsControllers', () => {
    it('does not mount /me when no user-metadata contract is provided', () => {
      const result = createRocketsControllers({});

      expect(result).toEqual([]);
    });

    it('does not mount /me for empty extras', () => {
      const result = createRocketsControllers({ extras: {} });

      expect(result).toEqual([]);
    });

    it('does not mount /me from disableController alone', () => {
      const result = createRocketsControllers({
        extras: { disableController: {} },
      });

      expect(result).toEqual([]);
    });

    it('mounts /me when user metadata is configured', () => {
      const result = createRocketsControllers({
        extras: { userMetadata: contributedUserMetadata },
      });

      // `buildMeController` returns a fresh class per config; the name is
      // the stable handle (it is what the route audit reports).
      expect(result?.map((controller) => controller.name)).toEqual([
        'MeController',
      ]);
    });

    it('should exclude MeController when disableController.me is true', () => {
      const result = createRocketsControllers({
        extras: {
          disableController: { me: true },
          userMetadata: contributedUserMetadata,
        },
      });

      expect(result).toEqual([]);
    });

    it('should return custom controllers when controllers is explicitly provided', () => {
      class CustomController {}

      const result = createRocketsControllers({
        controllers: [CustomController],
        extras: { userMetadata: contributedUserMetadata },
      });

      expect(result).toEqual([CustomController]);
    });

    it('should return empty array when controllers is explicitly empty', () => {
      const result = createRocketsControllers({
        controllers: [],
        extras: {},
      });

      expect(result).toEqual([]);
    });

    it('should ignore disableController when controllers is explicitly provided', () => {
      class CustomController {}

      const result = createRocketsControllers({
        controllers: [CustomController],
        extras: { disableController: { me: true } },
      });

      expect(result).toEqual([CustomController]);
    });
  });

  describe('createRocketsProviders', () => {
    it('includes APP_GUARD by default', () => {
      const result = createRocketsProviders({});
      const guardProvider = result.find(
        (p) =>
          typeof p === 'object' && 'provide' in p && p.provide === APP_GUARD,
      );
      expect(guardProvider).toBeDefined();
    });

    it('includes APP_GUARD when enableGlobalGuard is true', () => {
      const result = createRocketsProviders({
        extras: { enableGlobalGuard: true },
      });
      const guardProvider = result.find(
        (p) =>
          typeof p === 'object' && 'provide' in p && p.provide === APP_GUARD,
      );
      expect(guardProvider).toBeDefined();
    });

    it('excludes APP_GUARD when enableGlobalGuard is false', () => {
      const result = createRocketsProviders({
        extras: { enableGlobalGuard: false },
      });
      const guardProvider = result.find(
        (p) =>
          typeof p === 'object' && 'provide' in p && p.provide === APP_GUARD,
      );
      expect(guardProvider).toBeUndefined();
    });

    it('merges custom providers', () => {
      class CustomProvider {}
      const result = createRocketsProviders({
        providers: [CustomProvider],
      });
      expect(result).toContain(CustomProvider);
    });

    it('uses auth-contributed guard defaults', () => {
      const result = createRocketsProviders({
        extras: { auth: contributedAuth() },
      });
      const guardProvider = result.find(
        (provider) =>
          typeof provider === 'object' &&
          'provide' in provider &&
          provider.provide === APP_GUARD,
      );

      expect(guardProvider).toBeUndefined();
    });

    it('enables the Rockets guard when the integration app guard is disabled', () => {
      const result = createRocketsProviders({
        extras: {
          auth: contributedAuth({
            contributes: { providesAppGuard: false },
          }),
          enableGlobalGuard: true,
        },
      });
      const guardProvider = result.find(
        (provider) =>
          typeof provider === 'object' &&
          'provide' in provider &&
          provider.provide === APP_GUARD,
      );

      expect(guardProvider).toBeDefined();
    });
  });

  describe('resolveRocketsComposition', () => {
    it('throws when two integrations claim identity ownership', () => {
      // Even structurally identical claims are invalid: the chain
      // authenticates into ONE user space with ONE persistence owner.
      expect(() =>
        resolveRocketsComposition({
          auth: [contributedAuth(), contributedAuth()],
        }),
      ).toThrow(/identity ownership/);
    });

    it('throws on sliced identity ownership across integrations', () => {
      expect(() =>
        resolveRocketsComposition({
          auth: [
            contributedAuth({
              identity: { repository: undefined, resources: [] },
            }),
            contributedAuth({
              identity: { userMetadata: undefined, resources: [] },
            }),
          ],
        }),
      ).toThrow(/identity ownership/);
    });

    it('accepts one identity owner among credential-only integrations', () => {
      const credentialOnly = {
        adapter: ContributedAuthAdapter,
      } as AuthBootstrap;

      const composition = resolveRocketsComposition({
        auth: [
          contributedAuth({
            contributes: {
              enableGlobalGuard: true,
              providesAppGuard: false,
            },
          }),
          credentialOnly,
        ],
      });

      expect(composition.userMetadata).toBe(contributedUserMetadata);
      expect(composition.repository).toBe(contributedRepository);
    });

    it('rejects a multi-adapter chain when the Rockets guard is disabled', () => {
      const credentialOnly = {
        adapter: ContributedAuthAdapter,
      } as AuthBootstrap;

      expect(() =>
        resolveRocketsComposition({
          auth: [contributedAuth(), credentialOnly],
        }),
      ).toThrow(/multi-adapter|global guard|adapter chain/);
    });

    it('accepts a multi-adapter chain when the Rockets guard owns it', () => {
      const credentialOnly = {
        adapter: ContributedAuthAdapter,
      } as AuthBootstrap;

      const composition = resolveRocketsComposition({
        auth: [
          contributedAuth({
            contributes: {
              enableGlobalGuard: true,
              providesAppGuard: false,
            },
          }),
          credentialOnly,
        ],
      });

      expect(composition.enableGlobalGuard).toBe(true);
    });

    it('rejects simultaneous Rockets and integration-owned app guards', () => {
      expect(() =>
        resolveRocketsComposition({
          auth: contributedAuth(),
          enableGlobalGuard: true,
        }),
      ).toThrow(/one global authentication guard|integration-owned/);
    });

    it('throws when integrations contribute conflicting guard defaults', () => {
      expect(() =>
        resolveRocketsComposition({
          auth: [
            contributedAuth(),
            {
              adapter: ContributedAuthAdapter,
              contributes: { enableGlobalGuard: true },
            } as AuthBootstrap,
          ],
        }),
      ).toThrow(/conflicting enableGlobalGuard/);
    });

    it('throws when a contribution disables the guard without providing one', () => {
      expect(() =>
        resolveRocketsComposition({
          auth: contributedAuth({
            contributes: { providesAppGuard: undefined },
          }),
        }),
      ).toThrow(/providesAppGuard/);
    });

    it('accepts a contributed guard swap (enableGlobalGuard false + providesAppGuard)', () => {
      const composition = resolveRocketsComposition({
        auth: contributedAuth(),
      });

      expect(composition.enableGlobalGuard).toBe(false);
    });

    it('skips an identity resource the app already lists by reference', () => {
      const composition = resolveRocketsComposition({
        auth: contributedAuth(),
        resources: [contributedResource],
      });

      expect(composition.resources).toEqual([contributedResource]);
    });

    it('throws when identity and app define the same entity differently', () => {
      class SharedEntity {}
      const identityResource = {
        kind: 'crud',
        meta: { entityClass: SharedEntity },
      } as unknown as ResourceInput;
      const appResource = {
        kind: 'crud',
        meta: { entityClass: SharedEntity },
      } as unknown as ResourceInput;

      expect(() =>
        resolveRocketsComposition({
          auth: contributedAuth({
            identity: { resources: [identityResource] },
          }),
          resources: [appResource],
        }),
      ).toThrow(/SharedEntity/);
    });

    it('strips identity and contributes before handing bootstraps to core', () => {
      const forRootAsync = vi
        .spyOn(RocketsCoreModule, 'forRootAsync')
        .mockReturnValue({ module: RocketsCoreModule });

      createRocketsImports({
        imports: [],
        extras: { auth: contributedAuth() },
      });

      const coreAuth = forRootAsync.mock.calls[0][0]
        .auth as ReadonlyArray<AuthBootstrap>;
      expect(coreAuth[0].identity).toBeUndefined();
      expect(coreAuth[0].contributes).toBeUndefined();
      forRootAsync.mockRestore();
    });

    it('accepts an explicit app-level opt-out even without a replacement guard', () => {
      const composition = resolveRocketsComposition({
        auth: contributedAuth({
          contributes: { providesAppGuard: undefined },
        }),
        enableGlobalGuard: false,
      });

      expect(composition.enableGlobalGuard).toBe(false);
    });
  });

  describe('createRocketsImports', () => {
    it('forwards auth-contributed persistence defaults to core', () => {
      const forRootAsync = vi
        .spyOn(RocketsCoreModule, 'forRootAsync')
        .mockReturnValue({ module: RocketsCoreModule });

      createRocketsImports({
        imports: [],
        extras: { auth: contributedAuth() },
      });

      expect(forRootAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: contributedRepository,
          resources: [contributedResource],
          userMetadata: contributedUserMetadata,
        }),
      );
      forRootAsync.mockRestore();
    });

    it('lets explicit app settings override auth defaults while retaining auth resources', () => {
      const appRepository = {
        forFeature: vi.fn(),
      } as unknown as RepositoryModuleInterface;
      const appResource = { key: 'app-resource' } as unknown as ResourceInput;
      const appUserMetadata: RocketsUserMetadataConfig = {
        ...contributedUserMetadata,
        updateSchema: withOpenApi(
          z.object({ lastName: z.string().optional() }),
          'AppMetadataUpdateDto',
        ),
      };
      const forRootAsync = vi
        .spyOn(RocketsCoreModule, 'forRootAsync')
        .mockReturnValue({ module: RocketsCoreModule });

      createRocketsImports({
        imports: [],
        extras: {
          auth: contributedAuth(),
          repository: appRepository,
          resources: [appResource],
          userMetadata: appUserMetadata,
        },
      });

      expect(forRootAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: appRepository,
          resources: [contributedResource, appResource],
          userMetadata: appUserMetadata,
        }),
      );
      forRootAsync.mockRestore();
    });
  });

  describe('createRocketsExports', () => {
    it('always exports RAW_OPTIONS_TOKEN and ROCKETS_CORE_SETTINGS_TOKEN', () => {
      const result = createRocketsExports({ exports: [] });
      expect(result).toContain(RAW_OPTIONS_TOKEN);
      expect(result).toContain(ROCKETS_CORE_SETTINGS_TOKEN);
    });

    it('merges additional exports', () => {
      const customToken = Symbol('CUSTOM');
      const result = createRocketsExports({ exports: [customToken] });
      expect(result).toContain(customToken);
      expect(result).toContain(RAW_OPTIONS_TOKEN);
    });
  });
});
