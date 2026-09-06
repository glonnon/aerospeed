import { describe, expect, it } from 'vitest';
import '../src/content/polylines.js';
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

  it('truncates percent to a whole number', () => {
    const shares = DS.viz.sportShares([
      act({ movingTimeS: 9519 }),
      act({ type: 'Run', movingTimeS: 481 })
    ]);
    const ride = shares.find((s) => s.group === 'ride');
    expect(ride.pct).toBe(95);
    expect(Number.isInteger(ride.pct)).toBe(true);
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

describe('viz.streaks', () => {
  it('computes current, longest, gaps and consistency', () => {
    const acts = [];
    // activity today and yesterday -> current streak 2
    acts.push(act({ startDateLocal: daysAgo(0) }));
    acts.push(act({ startDateLocal: daysAgo(1), distanceM: 5000 }));
    // ... nothing for 3 days, then 3 consecutive days
    acts.push(act({ startDateLocal: daysAgo(6), distanceM: 6000 }));
    acts.push(act({ startDateLocal: daysAgo(7), distanceM: 7000 }));
    acts.push(act({ startDateLocal: daysAgo(8), distanceM: 8000 }));
    const s = DS.viz.streaks(acts, { days: 90 });
    expect(s.current).toBe(2);
    expect(s.longest).toBe(3);
    expect(s.longestGap).toBeGreaterThanOrEqual(3);
    expect(s.activeDays).toBe(5);
    expect(s.consistencyPct).toBe(Math.round((5 / 90) * 100));
  });

  it('respects filters and window', () => {
    const acts = [act({ startDateLocal: daysAgo(0), distanceM: 1000, type: 'Run' })];
    const all = DS.viz.streaks(acts, { days: 90 });
    expect(all.current).toBe(1);
    const ride = DS.viz.streaks(acts, { days: 90, filter: 'ride' });
    expect(ride.current).toBe(0);
    expect(ride.activeDays).toBe(0);
  });
});

describe('viz.qualityFlags', () => {
  it('flags missing GPS, implausible speed and suspicious HR', () => {
    const issues = DS.viz.qualityFlags([
      act({ id: 'q1', distanceM: 8000, movingTimeS: 300, hasGps: false, polyline: null }),
      act({ id: 'q2', distanceM: 20000, movingTimeS: 3600, hasGps: true, polyline: 'abc', averageHr: 210, hasHr: true }),
      act({ id: 'q3', distanceM: 10000, movingTimeS: 3600, hasGps: true, polyline: null })
    ]);
    const q1 = issues.find((x) => x.a.id === 'q1');
    const q2 = issues.find((x) => x.a.id === 'q2');
    expect(q1.flags).toContain('no-gps');
    expect(q1.flags).toContain('speed-high'); // 96 km/h
    expect(q2.flags).toContain('hr-weird');
    expect(issues.find((x) => x.a.id === 'q3')).toBeUndefined();
  });

  it('flags truncated polylines whose decoded path is way shorter than distance', () => {
    // Correctly encode a tiny loop that sums to ~280 m while the recorded
    // distance claims 100 km.
    const encv = (v) => {
      let r = v < 0 ? ~(v << 1) : v << 1;
      let o = '';
      while (r >= 0x20) {
        o += String.fromCharCode((0x20 | (r & 0x1f)) + 63);
        r >>= 5;
      }
      return o + String.fromCharCode(r + 63);
    };
    let s = '';
    let lat = 0;
    let lng = 0;
    for (const [la, lo] of [[0, 0], [0, 0.0004], [0, 0.0008], [0, 0.0012], [0, 0.0016], [0, 0.002]]) {
      s += encv(Math.round((la - lat) * 1e5));
      s += encv(Math.round((lo - lng) * 1e5));
      lat = la;
      lng = lo;
    }
    const issues = DS.viz.qualityFlags([
      act({ id: 't1', distanceM: 100000, movingTimeS: 7200, hasGps: true, polyline: s })
    ]);
    const t1 = issues.find((x) => x.a.id === 't1');
    expect(t1).toBeTruthy();
    expect(t1.flags).toContain('truncated');
  });
});

describe('viz.heatmap', () => {
  it('buckets hours into a Monday-based 7×24 grid', () => {
    const d = new Date('2026-09-06T18:30:00'); // Sunday evening
    const hm = DS.viz.heatmap([act({ startDateLocal: d.toISOString(), movingTimeS: 1800 })], { days: 180 });
    expect(hm.matrix).toHaveLength(7);
    expect(hm.matrix[0]).toHaveLength(24);
    expect(hm.matrix[6][18]).toBeCloseTo(0.5);
    expect(hm.max).toBeCloseTo(0.5);
    expect(hm.total).toBeCloseTo(0.5);
  });
});

describe('viz.monthlyTrends', () => {
  it('buckets by month and tracks HR/power presence', () => {
    const t = DS.viz.monthlyTrends([
      act({ startDateLocal: '2026-08-10T08:00:00', movingTimeS: 3600, averageHr: 145 }),
      act({ startDateLocal: '2026-08-20T08:00:00', movingTimeS: 1800, averageHr: 160, averageWatts: 200 })
    ]);
    expect(t.anyHr).toBe(true);
    expect(t.anyW).toBe(true);
    expect(t.months).toHaveLength(1);
    expect(t.months[0].rides).toBe(2);
    expect(t.months[0].hr).toBe(160);
    expect(t.months[0].watts).toBe(200);
  });
});

describe('viz.racePredictor', () => {
  it('predicts a finish from the best recent average speed', () => {
    const acts = [];
    for (let i = 1; i <= 10; i++) acts.push(act({ startDateLocal: daysAgo(i * 3), distanceM: 40000, movingTimeS: 5400 }));
    const p = DS.viz.racePredictor(acts, { distanceKm: 40 });
    expect(p).not.toBeNull();
    expect(p.distanceKm).toBe(40);
    expect(p.predictedHms).toBeGreaterThan(3000);
    expect(p.bestKph).toBeCloseTo(40000 / 5400 * 3.6, 1);
  });

  it('returns null without any usable rides', () => {
    expect(DS.viz.racePredictor([], { distanceKm: 40 })).toBe(null);
    expect(DS.viz.racePredictor([act({ distanceM: 0, movingTimeS: 0 })], { distanceKm: 40 })).toBe(null);
  });
});

describe('viz.shareStats', () => {
  it('aggregates this-year activity with all-time totals', () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const st = DS.viz.shareStats([
      act({ startDateLocal: `${yyyy}-06-01T08:00:00`, distanceM: 20000, movingTimeS: 3600, elevationM: 100 }),
      act({ startDateLocal: `${yyyy}-07-01T08:00:00`, distanceM: 10000, movingTimeS: 1800, elevationM: 50 }),
      act({ startDateLocal: `${yyyy - 1}-07-01T08:00:00`, distanceM: 99999, movingTimeS: 7200, elevationM: 1000 })
    ]);
    expect(st.count).toBe(2);
    expect(st.distKm).toBe(30);
    expect(st.totalCount).toBe(3);
    expect(st.bestStreak).toBeGreaterThanOrEqual(1);
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

  it('donutSvg center total is rounded to 0.1 h', () => {
    const svg = DS.viz.donutSvg([
      { group: 'ride', label: 'Ride', hours: 33.3, pct: 33 },
      { group: 'run', label: 'Run', hours: 61.9, pct: 61 }
    ]);
    expect(svg).toContain('>95.2 h<');
  });
});
