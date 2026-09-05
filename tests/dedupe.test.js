import { describe, expect, it } from 'vitest';
import '../src/content/polylines.js';
import '../src/content/dedupe.js';
import '../src/content/quality.js';

const DS = globalThis.DedupeStrava;

const BASE_SETTINGS = {
  timeWindowMinutes: 10,
  checkDstShift: true,
  typeMatching: 'same',
  distanceTolerancePct: 5,
  durationTolerancePct: 5,
  minOverlapPct: 80,
  polylineThreshold: 0.75,
  deepGpsCheck: false,
  deviceRanking: ['garmin', 'wahoo']
};

const act = (over = {}) => ({
  id: String(Math.random()).slice(2),
  name: 'Test',
  type: 'Ride',
  startDateLocal: '2026-05-01T08:00:00Z',
  distanceM: 20000,
  movingTimeS: 3000,
  elapsedTimeS: 3200,
  elevationM: 200,
  polyline: null,
  deviceName: null,
  manual: false,
  hasHr: false,
  hasPower: false,
  hasCadence: false,
  kudosCount: 0,
  commentCount: 0,
  photoCount: 0,
  prCount: 0,
  achievementCount: 0,
  ...over
});

const POLY_A = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

const decode = (s) => DS.polylines.decode(s);

function encode(points) {
  let px = 0;
  let py = 0;
  let out = '';
  for (const [la, ln] of points) {
    const nlat = Math.round(la * 1e5);
    const nlng = Math.round(ln * 1e5);
    out += enc(nlat - px) + enc(nlng - py);
    px = nlat;
    py = nlng;
  }
  return out;
}

function enc(v) {
  let x = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (x >= 0x20) {
    out += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
    x >>= 5;
  }
  out += String.fromCharCode(x + 63);
  return out;
}

describe('dedupe.pairCheck', () => {
  it('matches near-identical activities', () => {
    const r = DS.dedupe.pairCheck(act(), act({ id: 'b', startDateLocal: '2026-05-01T08:05:00Z' }), BASE_SETTINGS);
    expect(r.match).toBe(true);
  });

  it('rejects activities outside the time window', () => {
    const r = DS.dedupe.pairCheck(act(), act({ id: 'b', startDateLocal: '2026-05-01T08:37:00Z' }), BASE_SETTINGS);
    expect(r.match).toBe(false);
    expect(r.reason).toBe('time');
  });

  it('matches across a 1h DST shift when enabled', () => {
    const r = DS.dedupe.pairCheck(act(), act({ id: 'b', startDateLocal: '2026-05-01T09:04:00Z' }), BASE_SETTINGS);
    expect(r.match).toBe(true);
    const off = DS.dedupe.pairCheck(act(), act({ id: 'b', startDateLocal: '2026-05-01T09:04:00Z' }), {
      ...BASE_SETTINGS,
      checkDstShift: false
    });
    expect(off.match).toBe(false);
  });

  it('rejects different types unless related matching is on', () => {
    const b = act({ id: 'b', type: 'VirtualRide' });
    expect(DS.dedupe.pairCheck(act(), b, BASE_SETTINGS).match).toBe(false);
    expect(
      DS.dedupe.pairCheck(act(), b, { ...BASE_SETTINGS, typeMatching: 'related' }).match
    ).toBe(true);
  });

  it('rejects distance mismatches', () => {
    const r = DS.dedupe.pairCheck(act(), act({ id: 'b', distanceM: 24000 }), BASE_SETTINGS);
    expect(r.match).toBe(false);
    expect(r.reason).toBe('distance');
  });

  it('rejects duration mismatches', () => {
    const r = DS.dedupe.pairCheck(act(), act({ id: 'b', movingTimeS: 3450 }), BASE_SETTINGS);
    expect(r.match).toBe(false);
    expect(r.reason).toBe('duration');
  });

  it('rejects low time overlap', () => {
    const a = act({ movingTimeS: 600, id: 'a' });
    const b = act({ startDateLocal: '2026-05-01T08:03:00Z', movingTimeS: 600, id: 'b' });
    const r = DS.dedupe.pairCheck(a, b, BASE_SETTINGS);
    expect(r.match).toBe(false);
    expect(r.reason).toBe('overlap');
  });

  it('rejects when route similarity is low', () => {
    const farPoly = encode(decode(POLY_A).map(([la, ln]) => [la + 0.5, ln + 0.5]));
    const r = DS.dedupe.pairCheck(
      act({ polyline: POLY_A }),
      act({ id: 'b', polyline: farPoly }),
      BASE_SETTINGS
    );
    expect(r.match).toBe(false);
    expect(r.reason).toBe('route');
  });

  it('accepts high route similarity', () => {
    const nearPoly = encode(decode(POLY_A).map(([la, ln]) => [la + 0.0001, ln + 0.0001]));
    const r = DS.dedupe.pairCheck(
      act({ polyline: POLY_A }),
      act({ id: 'b', polyline: nearPoly }),
      BASE_SETTINGS
    );
    expect(r.match).toBe(true);
  });

  it('rejects missing data (never delete on unknowns)', () => {
    expect(DS.dedupe.pairCheck(act({ distanceM: null }), act({ id: 'b' }), BASE_SETTINGS).match).toBe(false);
    expect(DS.dedupe.pairCheck(act({ movingTimeS: null }), act({ id: 'b' }), BASE_SETTINGS).match).toBe(false);
    expect(DS.dedupe.pairCheck(act({ startDateLocal: null }), act({ id: 'b' }), BASE_SETTINGS).match).toBe(false);
  });
});

describe('dedupe.findGroups', () => {
  it('groups duplicates and picks the higher-quality keeper', () => {
    const good = act({
      id: 'good',
      deviceName: 'Garmin Edge 830',
      hasHr: true,
      hasPower: true,
      kudosCount: 5
    });
    const bad = act({ id: 'bad', manual: true, deviceName: null, startDateLocal: '2026-05-01T08:02:00Z' });
    const far = act({ id: 'far', startDateLocal: '2026-06-01T08:00:00Z' });

    const groups = DS.dedupe.findGroups([bad, good, far], BASE_SETTINGS);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.id).toBe('good');
    expect(groups[0].remove.map((a) => a.id)).toEqual(['bad']);
    expect(groups[0].uncertain).toBe(false);
  });

  it('marks near-ties as uncertain', () => {
    const a = act({ id: 'a' });
    const b = act({ id: 'b', startDateLocal: '2026-05-01T08:01:00Z' });
    const groups = DS.dedupe.findGroups([a, b], BASE_SETTINGS);
    expect(groups[0].uncertain).toBe(true);
  });

  it('always recommends a keeper via relative metrics on flat ties', () => {
    const flat = act({ id: 'flat', distanceM: 20000, movingTimeS: 3000, elevationM: 200 });
    const stronger = act({ id: 'stronger', distanceM: 20200, movingTimeS: 3000, elevationM: 500, startDateLocal: '2026-05-01T08:02:00Z' });
    const groups = DS.dedupe.findGroups([flat, stronger], BASE_SETTINGS);
    expect(groups[0].keep.id).toBe('stronger');
    expect(groups[0].remove.map((a) => a.id)).toEqual(['flat']);
    expect(groups[0].scores[0].relBonus).toBeGreaterThan(groups[0].scores[1].relBonus);
  });});

describe('quality.score', () => {
  it('rewards richer data and trusted devices', () => {
    const s = DS.quality.score(
      act({ hasHr: true, hasPower: true, deviceName: 'Garmin Forerunner 945', polyline: POLY_A }),
      BASE_SETTINGS
    );
    expect(s.total).toBeGreaterThanOrEqual(10 + 10 + 8 + 5);
  });

  it('penalizes manual activities', () => {
    const withData = DS.quality.score(act({ manual: true }), BASE_SETTINGS);
    const clean = DS.quality.score(act(), BASE_SETTINGS);
    expect(withData.total).toBe(clean.total - 10);
  });

  it('caps social score', () => {
    const s = DS.quality.score(act({ kudosCount: 50, commentCount: 50, photoCount: 50 }), BASE_SETTINGS);
    expect(s.breakdown.social).toBe(4);
  });
});
