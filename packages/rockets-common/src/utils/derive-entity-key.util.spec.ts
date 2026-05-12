import { deriveEntityKey } from './derive-entity-key.util';

describe('deriveEntityKey', () => {
  it('strips trailing `Entity` and lowercases first char', () => {
    class UserEntity {}
    expect(deriveEntityKey(UserEntity)).toBe('user');
  });

  it('preserves internal camel case', () => {
    class PetTagEntity {}
    expect(deriveEntityKey(PetTagEntity)).toBe('petTag');
  });

  it('lowercases first char when there is no `Entity` suffix', () => {
    class Order {}
    expect(deriveEntityKey(Order)).toBe('order');
  });

  it('handles single-letter classes', () => {
    class XEntity {}
    expect(deriveEntityKey(XEntity)).toBe('x');
  });

  it('throws on anonymous classes', () => {
    const Anon = (() => class {})();
    expect(() => deriveEntityKey(Anon)).toThrow(/anonymous class/);
  });

  it('throws when stripping `Entity` leaves an empty name', () => {
    class Entity {}
    expect(() => deriveEntityKey(Entity)).toThrow(/stripped to empty/);
  });

  it('idempotent on already-camelCase derived names', () => {
    class FooEntity {}
    const first = deriveEntityKey(FooEntity);
    expect(deriveEntityKey(FooEntity)).toBe(first);
  });

  // Pins the documented quirk on the function (`URLEntity` → `'uRL'`).
  // Acronym-aware lowering is intentionally NOT done — the explicit
  // `key` field on `defineResource` is the escape hatch. If anyone
  // "improves" the algorithm to special-case acronyms, this test fails
  // and the tradeoff has to be revisited deliberately.
  it('produces awkward output for ALLCAPS acronyms (documented quirk)', () => {
    class URLEntity {}
    expect(deriveEntityKey(URLEntity)).toBe('uRL');
  });

  it('treats `Entity` substring elsewhere in the name as part of the key', () => {
    class EntityProfileEntity {}
    expect(deriveEntityKey(EntityProfileEntity)).toBe('entityProfile');
  });

  it('only strips the trailing `Entity` once', () => {
    class EntityEntity {}
    expect(deriveEntityKey(EntityEntity)).toBe('entity');
  });
});
