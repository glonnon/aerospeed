import { describe, expect, it } from 'vitest';
import '../src/content/viz.js';

const DS = globalThis.DedupeStrava;

const act = (over = {}) => ({
  id: 'x',
  name: 'T',
  type: 'Ride',
  startDateLocal: new Date(Date.now() - 2 * 86400000).toISOString(),
  distanceM: 20000,
  movingTimeS: 3600,
  elevationM: 100,
  ...over
});

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe('viz.sportGroup', () => {
  it('maps types into groups', () => {
    expect(DS.viz.sportGroup('MountainBikeRide')).toBe('ride');
    expect(DS.viz.sportGroup('VirtualRun')).toBe('run');
    expect(DS.viz.sportGroup('Swim')).toBe('swim');
    expect(DS.viz.sportGroup('WeightTraining')).toBe('other');
    expect(DS.viz.sportGroup(null)).toBe('other');
  });
});

describe('viz.summary', () => {
  it('totals distance, time, elevation and respects filters', () => {
    const acts = [act(), act({ type: 'Run', distanceM: 10000, movingTimeS: 3000, elevationM: 50 })];
    const all = DS.viz.summary(acts, 'all');
    expect(all.count).toBe(2);
    expect(all.distanceKm).toBe(30);
    expect(all.timeH).toBeCloseTo(1.8, 5);
    expect(all.elevationM).toBe(150);
    const rides = DS.viz.summary(acts, 'ride');
    expect(rides.count).toBe(1);
    expect(rides.distanceKm).toBe(20);
  });
});

describe('viz.weeklySeries', () => {
  it('buckets activities into N monday-started weeks with zeros elsewhere', () => {
    const acts = [
      act({ distanceM: 30000 }),
      act({ startDateLocal: daysAgo(1), distanceM: 10000 })
    ];
    const series = DS.viz.weeklySeries(acts, { weeks: 4 });
    expect(series).toHaveLength(4);
    const active = series.filter((b) => b.Ride > 0);
    expect(active).toHaveLength(1);
    expect(active[0].Ride).toBeCloseTo(40);
    expect(active[0].count).toBe(2);
    const day = new Date(active[0].label);
    expect(day.getDay()).toBe(1);
  });

  it('drops activities outside the window', () => {
    const series = DS.viz.weeklySeries([act({ startDateLocal: '2020-01-01T00:00:00Z' })], { weeks: 4 });
    expect(series.every((b) => b.count === 0)).toBe(true);
  });
});

describe('viz.calendarCells', () => {
  it('produces blanks + days aligned to monday columns', () => {
    const { cells } = DS.viz.calendarCells([act()], { days: 182 });
    const blanks = cells.filter((c) => c.blank).length;
    expect(cells.length).toBe(182 + blanks);
    const firstReal = cells.find((c) => !c.blank);
    expect(cells.indexOf(firstReal)).toBe(blanks);
    expect(blanks).toBeLessThan(7);
  });

  it('levels by moving time', () => {
    const { cells } = DS.viz.calendarCells(
      [act({ movingTimeS: 600 }), act({ movingTimeS: 9000, startDateLocal: daysAgo(3) })],
      { days: 182 }
    );
    const l1 = cells.find((c) => !c.blank && c.hours === 600 / 3600);
    const l4 = cells.find((c) => !c.blank && c.hours === 9000 / 3600);
    expect(l1.level).toBe(1);
    expect(l4.level).toBeGreaterThanOrEqual(4);
  });

  it('exposes the activities done on each day', () => {
    const d1 = daysAgo(2);
    const d2 = daysAgo(2);
    const { days } = DS.viz.calendarCells(
      [
        act({ id: 'a1', name: 'First', startDateLocal: d1, distanceM: 10000 }),
        act({ id: 'a2', name: 'Second', startDateLocal: d2, distanceM: 20000, type: 'Run' })
      ],
      { days: 30 }
    );
    const key = DS.viz.dayKey(new Date(d1));
    expect(days[key]).toHaveLength(2);
    expect(days[key].map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    expect(days[key][0].url).toContain('/activities/');
  });
});

describe('viz.sportShares', () => {
  it('computes percentage of moving time per group', () => {
    const shares = DS.viz.sportShares([
      act({ movingTimeS: 3600 }),
      act({ type: 'Run', movingTimeS: 3600 }),
      act({ type: 'Swim', movingTimeS: 3600 })
    ]);
    expect(shares.find((s) => s.group === 'ride').pct).toBe(33);
    expect(shares.reduce((t, s) => t + s.hours, 0)).toBeCloseTo(3, 5);
  });
});

describe('viz.topActivities', () => {
  it('returns longest, filtered, within window', () => {
    const top = DS.viz.topActivities(
      [act({ distanceM: 1000 }), act({ distanceM: 90000 }), act({ distanceM: 40000, startDateLocal: '2020-01-01T00:00:00Z' })],
      { n: 2, withinDays: 90 }
    );
    expect(top).toHaveLength(2);
    expect(top[0].a.distanceM).toBe(90000);
    expect(top.every(({ a }) => a.distanceM !== 40000)).toBe(true);
  });
});

describe('viz.fitRange', () => {
  it('scales chart ranges to the loaded data span', () => {
    expect(DS.viz.fitRange(90)).toEqual({ weeks: 13, calDays: 90 });
    expect(DS.viz.fitRange(5)).toEqual({ weeks: 4, calDays: 28 });
    expect(DS.viz.fitRange(0)).toEqual({ weeks: 4, calDays: 28 });
    expect(DS.viz.fitRange(200)).toEqual({ weeks: 29, calDays: 182 });
    expect(DS.viz.fitRange(400)).toEqual({ weeks: 52, calDays: 182 });
  });
});

describe('viz.gearSummary', () => {
  it('groups activities by gear id with totals', () => {
    const gears = DS.viz.gearSummary([
      act({ gearId: 'b1', distanceM: 30000, movingTimeS: 3600 }),
      act({ gearId: 'b2', distanceM: 10000, movingTimeS: 1800, startDateLocal: daysAgo(1) }),
      act({ gearId: 'b1', distanceM: 5000, movingTimeS: 900, startDateLocal: daysAgo(2) })
    ]);
    expect(gears).toHaveLength(2);
    const b1 = gears.find((g) => g.gearId === 'b1');
    expect(b1.count).toBe(2);
    expect(b1.distM).toBe(35000);
    expect(b1.timeS).toBe(4500);
    expect(b1.last).toBeTruthy();
    expect(gears[0].gearId).toBe('b1');
  });

  it('skips activities without gear', () => {
    expect(DS.viz.gearSummary([act({ gearId: null })])).toHaveLength(0);
  });
});

describe('viz.yearSummaries', () => {
  it('aggregates per calendar year', () => {
    const ys = DS.viz.yearSummaries([
      act({ startDateLocal: new Date('2025-06-01T08:00:00Z').toISOString(), distanceM: 20000, movingTimeS: 3600 }),
      act({ startDateLocal: new Date('2026-01-02T08:00:00Z').toISOString(), distanceM: 10000, movingTimeS: 1800 })
    ]);
    expect(ys).toHaveLength(2);
    expect(ys[0].year).toBe(2026);
    expect(ys[0].count).toBe(1);
    expect(ys[0].distKm).toBe(10);
    expect(ys[1].year).toBe(2025);
  });
});

describe('viz svg builders', () => {
  it('weeklyBarsSvg renders axes, bars, month labels and a rolling average', () => {
    const acts = [
      act({ distanceM: 30000 }),
      act({ startDateLocal: daysAgo(8), distanceM: 12000, type: 'Run' })
    ];
    const series = DS.viz.weeklySeries(acts, { weeks: 26 });
    const svg = DS.viz.weeklyBarsSvg(series);
    const imp = DS.viz.weeklyBarsSvg(series, 'imperial');
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('>km<');
    expect(imp).toContain('>mi<');
    expect((svg.match(/<rect/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('polyline');
  });

  it('calendarSvg renders day rects with month and weekday labels', () => {
    const cal = DS.viz.calendarCells([], { days: 70 });
    const svg = DS.viz.calendarSvg(cal);
    expect((svg.match(/<rect/g) || []).length).toBe(70);
    expect(svg).toContain('>M<');
    expect(svg).toContain('>W<');
    expect(svg).toContain('>F<');
    expect((svg.match(/<text/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('calendar levels scale relative to the athlete (quantiles, not fixed hours)', () => {
    const bigH = 5;
    const acts = [];
    for (let i = 1; i <= 20; i++) acts.push(act({ movingTimeS: bigH * 3600, startDateLocal: daysAgo(i * 2) }));
    acts.push(act({ movingTimeS: 1200, startDateLocal: daysAgo(1) }));
    const { cells, thresholds } = DS.viz.calendarCells(acts, { days: 60 });
    expect(thresholds).toHaveLength(4);
    for (let i = 1; i < thresholds.length; i++) expect(thresholds[i]).toBeGreaterThanOrEqual(thresholds[i - 1]);
    const lowDay = cells.find((c) => !c.blank && c.hours === 1200 / 3600);
    const bigDay = cells.find((c) => !c.blank && c.hours === bigH);
    expect(lowDay.level).toBe(1);
    expect(bigDay.level).toBe(5);
  });

  it('donutSvg renders arcs only for non-zero shares', () => {
    const svg = DS.viz.donutSvg(DS.viz.sportShares([act()]));
    expect(svg.match(/stroke-dasharray/g)).toHaveLength(1);
  });
});
