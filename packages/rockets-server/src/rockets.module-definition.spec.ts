import { APP_GUARD } from '@nestjs/core';
import { ROCKETS_CORE_SETTINGS_TOKEN } from '@bitwild/rockets-core';
import { MeController } from './gateways/http/me.controller';
import {
  createRocketsControllers,
  createRocketsProviders,
  createRocketsExports,
} from './rockets.module-definition';
import { RAW_OPTIONS_TOKEN } from './rockets.tokens';

describe('RocketsModuleDefinition', () => {
  describe('createRocketsControllers', () => {
    it('should return MeController by default when no options provided', () => {
      const result = createRocketsControllers({});

      expect(result).toContain(MeController);
      expect(result).toHaveLength(1);
    });

    it('should return MeController when extras is empty object', () => {
      const result = createRocketsControllers({ extras: {} });

      expect(result).toContain(MeController);
      expect(result).toHaveLength(1);
    });

    it('should return MeController when disableController is empty object', () => {
      const result = createRocketsControllers({
        extras: { disableController: {} },
      });

      expect(result).toContain(MeController);
      expect(result).toHaveLength(1);
    });

    it('should return MeController when disableController.me is false', () => {
      const result = createRocketsControllers({
        extras: { disableController: { me: false } },
      });

      expect(result).toContain(MeController);
      expect(result).toHaveLength(1);
    });

    it('should exclude MeController when disableController.me is true', () => {
      const result = createRocketsControllers({
        extras: { disableController: { me: true } },
      });

      expect(result).not.toContain(MeController);
      expect(result).toEqual([]);
    });

    it('should return custom controllers when controllers is explicitly provided', () => {
      class CustomController {}

      const result = createRocketsControllers({
        controllers: [CustomController],
        extras: {},
      });

      expect(result).toEqual([CustomController]);
      expect(result).not.toContain(MeController);
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
