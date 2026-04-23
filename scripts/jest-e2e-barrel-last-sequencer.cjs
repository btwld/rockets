const Sequencer = require('@jest/test-sequencer').default;

/**
 * Custom Jest sequencer that ensures barrel/domain tests run LAST.
 *
 * Barrel imports register @CommandHandler/@QueryHandler decorators in
 * global Reflect metadata, which can break later Nest apps in the same
 * Jest process (maxWorkers: 1).
 */
class BarrelLastSequencer extends Sequencer {
  sort(tests) {
    const copy = [...tests];
    return copy.sort((a, b) => {
      const aIsBarrel = a.path.includes('barrel');
      const bIsBarrel = b.path.includes('barrel');
      if (aIsBarrel && !bIsBarrel) return 1;
      if (!aIsBarrel && bIsBarrel) return -1;
      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = BarrelLastSequencer;
