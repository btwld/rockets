import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';

import { InMemoryRateLimitStore } from './in-memory-rate-limit-store.service';

describe('InMemoryRateLimitStore', () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request under the limit', async () => {
    const result = await store.consume('k1', 5, 60_000);
    expect(result).toMatchObject({ allowed: true, limit: 5, remaining: 4 });
  });

  it('denies once the limit is exceeded within the same window', async () => {
    for (let i = 0; i < 5; i++) {
      await store.consume('k1', 5, 60_000);
    }
    const result = await store.consume('k1', 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('remaining never goes negative past the limit', async () => {
    for (let i = 0; i < 10; i++) {
      await store.consume('k1', 3, 60_000);
    }
    const result = await store.consume('k1', 3, 60_000);
    expect(result.remaining).toBe(0);
  });

  it('resets the count once the window elapses', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      await store.consume('k1', 5, 100);
    }
    await expect(
      store.consume('k1', 5, 100).then((r) => r.allowed),
    ).resolves.toBe(false);

    vi.advanceTimersByTime(150);

    const result = await store.consume('k1', 5, 100);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('tracks separate keys independently', async () => {
    for (let i = 0; i < 5; i++) {
      await store.consume('k1', 5, 60_000);
    }
    const other = await store.consume('k2', 5, 60_000);
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(4);
  });

  it('resetAt is windowStart + windowMs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const result = await store.consume('k1', 5, 60_000);
    expect(result.resetAt).toBe(1_000_000 + 60_000);
  });

  // The counter key carries an attacker-supplied account field, and
  // guards run BEFORE pipes, so a public login route inserts one fresh
  // key per request. Without a bound, requests that were correctly
  // rate-limited still grow the map forever — growth INSIDE the policy,
  // which the per-IP ceiling cannot stop.
  describe('key bounds', () => {
    it('does not grow past the cap on unbounded distinct keys', async () => {
      const capped = new InMemoryRateLimitStore(50);

      for (let i = 0; i < 500; i += 1) {
        await capped.consume(`attacker-${i}`, 1000, 60_000);
      }

      expect(capped.size).toBeLessThanOrEqual(50);
    });

    it('reclaims expired keys before touching live ones', async () => {
      vi.useFakeTimers();
      const capped = new InMemoryRateLimitStore(10);

      for (let i = 0; i < 10; i += 1) {
        await capped.consume(`short-${i}`, 1000, 1_000);
      }
      vi.advanceTimersByTime(1_001);

      await capped.consume('live', 1000, 3_600_000);
      await capped.consume('live', 1000, 3_600_000);

      expect(capped.size).toBeLessThanOrEqual(10);
      // The live window survived the sweep with its count intact —
      // evicting it would silently raise the effective limit, which is
      // the failure mode the cap itself can introduce.
      expect(await capped.consume('live', 1000, 3_600_000)).toMatchObject({
        remaining: 997,
      });
    });

    it('only drops a live window at the ceiling, and says so', async () => {
      const capped = new InMemoryRateLimitStore(2);
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      for (let i = 0; i < 10; i += 1) {
        await capped.consume(`live-${i}`, 1000, 3_600_000);
      }

      expect(capped.size).toBeLessThanOrEqual(2);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    // A cap below one evicts the entry `consume` just inserted, so every
    // request starts a fresh window and the limiter admits everything —
    // silently, from one bad config value (`Number(process.env.X)` on an
    // unset variable is `NaN`).
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses a maxKeys of %s instead of admitting everything',
      (maxKeys) => {
        expect(() => new InMemoryRateLimitStore(maxKeys)).toThrow(
          /maxKeys must be an integer >= 1/,
        );
      },
    );

    // The ceiling dimension's key is created on request one of a flood
    // and only updated after that. Evicting by expiry made it the FIRST
    // thing dropped — the account-rotation traffic the ceiling exists to
    // stop was what reset the ceiling, and admitted volume then scaled
    // with attack rate.
    it('keeps the hot ceiling key while unique keys flood past the cap', async () => {
      const capped = new InMemoryRateLimitStore(10);
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await capped.consume('ip:1.2.3.4', 1000, 60_000);
      for (let i = 0; i < 200; i += 1) {
        // Same window length as the ceiling, so expiry order is creation
        // order — the case the old comparator got wrong.
        await capped.consume(`default:1.2.3.4::acct${i}`, 5, 60_000);
        // The ceiling counts every attempt, which is what keeps it hot.
        await capped.consume('ip:1.2.3.4', 1000, 60_000);
      }

      expect(capped.size).toBeLessThanOrEqual(10);
      const ceiling = await capped.consume('ip:1.2.3.4', 1000, 60_000);
      expect(ceiling.remaining).toBe(1000 - 202);
      warn.mockRestore();
    });

    it('coalesces the live-drop warning instead of logging per request', async () => {
      vi.useFakeTimers();
      const capped = new InMemoryRateLimitStore(2);
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      for (let i = 0; i < 50; i += 1) {
        await capped.consume(`live-${i}`, 1000, 3_600_000);
      }
      expect(warn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_001);
      await capped.consume('live-later', 1000, 3_600_000);
      expect(warn).toHaveBeenCalledTimes(2);
      // The count carries what the silence covered, so nothing is lost.
      expect(warn.mock.calls[1]?.[0]).toContain('dropped 48 live');
      warn.mockRestore();
    });
  });
});
