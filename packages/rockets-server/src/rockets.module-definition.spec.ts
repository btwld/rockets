import { MeController } from './gateways/http/me.controller';
import { createRocketsControllers } from './rockets.module-definition';

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
});
