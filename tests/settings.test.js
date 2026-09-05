import { describe, expect, it } from 'vitest';
import '../src/content/settings.store.js';

const DS = globalThis.DedupeStrava;

describe('settingsStore.sanitize', () => {
  it('returns defaults for empty input', () => {
    const s = DS.settingsStore.sanitize({});
    expect(s.timeWindowMinutes).toBe(10);
    expect(s.distanceTolerancePct).toBe(5);
    expect(s.durationTolerancePct).toBe(5);
    expect(s.minOverlapPct).toBe(80);
    expect(s.deletionMode).toBe('links');
    expect(s.checkDstShift).toBe(true);
    expect(s.deviceRanking[0]).toBe('garmin');
  });

  it('clamps out-of-range values', () => {
    const s = DS.settingsStore.sanitize({
      timeWindowMinutes: 9999,
      distanceTolerancePct: -5,
      minOverlapPct: 3,
      polylineThreshold: 7
    });
    expect(s.timeWindowMinutes).toBe(120);
    expect(s.distanceTolerancePct).toBe(1);
    expect(s.minOverlapPct).toBe(10);
    expect(s.polylineThreshold).toBe(1);
  });

  it('keeps only whitelisted modes', () => {
    expect(DS.settingsStore.sanitize({ deletionMode: 'auto' }).deletionMode).toBe('auto');
    expect(DS.settingsStore.sanitize({ deletionMode: 'nuke' }).deletionMode).toBe('links');
    expect(DS.settingsStore.sanitize({ typeMatching: 'everything' }).typeMatching).toBe('same');
  });

  it('whitelists scan scopes and defaults to recent 100', () => {
    expect(DS.settingsStore.sanitize({}).scanScope).toBe('100');
    for (const s of ['100', '90', '180', '365', 'all']) {
      expect(DS.settingsStore.sanitize({ scanScope: s }).scanScope).toBe(s);
    }
    expect(DS.settingsStore.sanitize({ scanScope: '3000' }).scanScope).toBe('100');
    expect(DS.settingsStore.sanitize({ scanScope: 'everything' }).scanScope).toBe('100');
  });

  it('defaults units to metric and accepts imperial', () => {
    expect(DS.settingsStore.sanitize({}).units).toBe('metric');
    expect(DS.settingsStore.sanitize({ units: 'imperial' }).units).toBe('imperial');
    expect(DS.settingsStore.sanitize({ units: 'furlongs' }).units).toBe('metric');
  });

  it('cleans device ranking (lowercase, dedup, non-empty)', () => {
    const s = DS.settingsStore.sanitize({ deviceRanking: ['Garmin', '', 'garmin', 'Wahoo'] });
    expect(s.deviceRanking).toEqual(['garmin', 'wahoo']);
  });

  it('rejects junk numbers', () => {
    const s = DS.settingsStore.sanitize({ timeWindowMinutes: 'abc', minOverlapPct: NaN });
    expect(s.timeWindowMinutes).toBe(10);
    expect(s.minOverlapPct).toBe(80);
  });
});

describe('settingsStore without extension APIs', () => {
  it('load falls back to defaults when storage is unavailable', async () => {
    const s = await DS.settingsStore.load();
    expect(s.deletionMode).toBe('links');
  });

  it('save merges patches in cache without storage', async () => {
    await DS.settingsStore.load();
    const s = await DS.settingsStore.save({ timeWindowMinutes: 25 });
    expect(s.timeWindowMinutes).toBe(25);
    expect(DS.settingsStore.get().timeWindowMinutes).toBe(25);
  });

  it('kv helpers store arbitrary data in storage.local', async () => {
    const local = {};
    DS.ext = {
      storage: {
        local: {
          get: async (k) => ({ [k]: local[k] }),
          set: async (o) => Object.assign(local, o)
        }
      }
    };
    await DS.kv.set('activityCache', { savedAt: 5, activities: [{ id: '1' }] });
    const c = await DS.kv.get('activityCache');
    expect(c.savedAt).toBe(5);
    expect(c.activities[0].id).toBe('1');
    DS.ext = undefined;
  });

  it('kv returns null without storage available', async () => {
    DS.ext = undefined;
    expect(await DS.kv.get('activityCache')).toBeNull();
    await DS.kv.set('activityCache', { ok: 1 });
  });
});
