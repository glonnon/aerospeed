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

describe('fitness.weeklyLoads', () => {
  it('buckets hours into Monday-started weeks (current week partial)', () => {
    const acts = [];
    for (let i = 0; i < 14; i++) acts.push({ startDateLocal: daysAgoIso(i), movingTimeS: 36000 });
    const w = DS.fitness.weeklyLoads(acts, { weeks: 4, days: 30 });
    expect(w).toHaveLength(4);
    expect(w.reduce((t, x) => t + x.load, 0)).toBe(140); // 14 days × 10h
    for (const x of w) expect(x.weekStart.getDay()).toBe(1); // Mondays
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    expect(w[3].weekStart.getTime()).toBe(monday.getTime()); // current Monday
  });
});

describe('fitness.guardrails', () => {
  it('returns ramp, CTL delta, ACWR for steady training', () => {
    const acts = [];
    for (let i = 0; i < 40; i++) acts.push({ startDateLocal: daysAgoIso(i), movingTimeS: 3600 });
    const g = DS.fitness.guardrails(acts);
    expect(g).not.toBeNull();
    expect(g.rampPct).toBe(0);
    expect(g.acwr).toBeCloseTo(1, 1);
    expect(g.flags).toEqual([]);
    expect(g.ctlDelta).toBeGreaterThan(-2);
  });

  it('flags a sharp ramp-up', () => {
    const acts = [];
    for (let i = 8; i < 40; i++) acts.push({ startDateLocal: daysAgoIso(i), movingTimeS: 3600 });
    for (let i = 0; i < 7; i++) acts.push({ startDateLocal: daysAgoIso(i), movingTimeS: 14400 });
    const g = DS.fitness.guardrails(acts);
    expect(g.rampPct).toBeGreaterThan(200);
    expect(g.acwr).toBeGreaterThan(1.5);
    expect(g.flags).toContain('ramp');
    expect(g.flags).toContain('acwr-high');
  });

  it('returns null without enough history', () => {
    expect(DS.fitness.guardrails([], { days: 10 })).toBe(null);
  });
});

describe('fitness.monotonyScore', () => {
  it('reports low monotony with varied loads', () => {
    const acts = [];
    const pattern = [3600, 7200, 0, 3600, 0, 7200, 1800];
    for (let w = 0; w < 6; w++) {
      for (let d = 0; d < 7; d++) {
        if (pattern[d] > 0) acts.push({ startDateLocal: daysAgoIso(w * 7 + d), movingTimeS: pattern[d] });
      }
    }
    const m = DS.fitness.monotonyScore(acts, { days: 42 });
    expect(m).not.toBeNull();
    expect(m.monotony).toBeLessThan(2);
    expect(m.strain).toBeGreaterThan(0);
    expect(m.activeDays).toBe(30);
  });

  it('reports high monotony when the same load repeats daily', () => {
    const acts = [];
    for (let i = 0; i < 28; i++) acts.push({ startDateLocal: daysAgoIso(i), movingTimeS: 3600 });
    const m = DS.fitness.monotonyScore(acts, { days: 28 });
    expect(m).not.toBeNull();
    expect(m.flags).toContain('monotony');
    expect(m.monotony).toBeGreaterThanOrEqual(2);
  });

  it('returns null without any load', () => {
    expect(DS.fitness.monotonyScore([], { days: 20 })).toBe(null);
  });
});

describe('fitness.chartSvg', () => {
  it('renders three polylines with month labels', () => {
    const s = DS.fitness.series([], { days: 60 });
    const svg = DS.fitness.chartSvg(s);
    expect((svg.match(/<polyline/g) || []).length).toBe(3);
    expect(svg).toMatch(/^<svg/);
  });

  it('includes a hover cursor line and an overlay for mouse tracking', () => {
    const s = DS.fitness.series([], { days: 60 });
    const svg = DS.fitness.chartSvg(s);
    expect(svg).toContain('class="ds-fit-cursor"');
    expect(svg).toContain('class="ds-fit-overlay"');
    expect(svg).toContain('pointer-events="all"');
  });

  it('exposes the chart geometry for hover mapping', () => {
    expect(DS.fitness.CHART).toMatchObject({ W: 860, H: 210 });
    expect(DS.fitness.CHART.pad.l).toBeGreaterThan(0);
  });
});