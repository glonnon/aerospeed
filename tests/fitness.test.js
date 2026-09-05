import { describe, expect, it } from 'vitest';
import '../src/content/fitness.js';

const DS = globalThis.DedupeStrava;

const daysAgoIso = (n, hour = 8) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

describe('fitness.dailyLoad', () => {
  it('aggregates moving hours per day', () => {
    const loads = DS.fitness.dailyLoad(
      [
        { startDateLocal: daysAgoIso(2), movingTimeS: 3600 },
        { startDateLocal: daysAgoIso(2), movingTimeS: 1800 },
        { startDateLocal: daysAgoIso(5), movingTimeS: 5400 }
      ],
      14
    );
    expect(loads).toHaveLength(14);
    const two = loads.find((p) => p.date.getDay() === new Date(daysAgoIso(2)).getDay() && Math.abs(p.date - new Date(daysAgoIso(2))) < 86400000);
    expect(two.load).toBeCloseTo(1.5);
    const five = loads.find((p) => Math.abs(p.date - new Date(daysAgoIso(5))) < 86400000);
    expect(five.load).toBeCloseTo(1.5);
  });
});

describe('fitness.series', () => {
  it('returns one point per day with ctl/atl/tsb', () => {
    const s = DS.fitness.series([], { days: 30 });
    expect(s).toHaveLength(30);
    expect(s.every((p) => p.ctl === 0 && p.atl === 0 && p.tsb === 0)).toBe(true);
  });

  it('converges a constant load toward steady state (tsb -> ~0)', () => {
    const acts = [];
    for (let i = 0; i < 90; i++) acts.push({ startDateLocal: daysAgoIso(i), movingTimeS: 7200 });
    const s = DS.fitness.series(acts, { days: 90 });
    const last = s[s.length - 1];
    expect(last.ctl).toBeGreaterThan(1);
    expect(last.atl).toBeGreaterThan(1);
    expect(Math.abs(last.tsb)).toBeLessThan(0.5);
    expect(last.ctl).toBeLessThanOrEqual(2.01);
  });

  it('recent spike raises ATL more than CTL (negative form)', () => {
    const acts = [];
    for (let i = 5; i < 70; i++) acts.push({ startDateLocal: daysAgoIso(i), movingTimeS: 3600 });
    for (let i = 0; i < 5; i++) acts.push({ startDateLocal: daysAgoIso(i), movingTimeS: 3600 * 6 });
    const s = DS.fitness.series(acts, { days: 70 });
    expect(s[s.length - 1].tsb).toBeLessThan(-0.2);
  });
});

describe('fitness.snapshot', () => {
  it('returns the latest ctl/atl/tsb rounded to 0.1', () => {
    const snap = DS.fitness.snapshot([{ startDateLocal: daysAgoIso(1), movingTimeS: 21600 }], { days: 10 });
    expect(snap).toMatchObject({ ctl: expect.any(Number), atl: expect.any(Number), tsb: expect.any(Number) });
    expect(snap.atl).toBeGreaterThan(0);
  });

  it('returns all zeros with no activities', () => {
    const snap = DS.fitness.snapshot([], { days: 10 });
    expect(snap).toEqual({ ctl: 0, atl: 0, tsb: 0 });
  });
});

describe('fitness.chartSvg', () => {
  it('renders three polylines with month labels', () => {
    const s = DS.fitness.series([], { days: 60 });
    const svg = DS.fitness.chartSvg(s);
    expect((svg.match(/<polyline/g) || []).length).toBe(3);
    expect(svg).toMatch(/^<svg/);
  });
});