import { describe, expect, it } from 'vitest';
import '../src/content/viz.js';
import '../src/content/plans.js';

const DS = globalThis.DedupeStrava;

const daysAgoIso = (n, hour = 8) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const mondayThisWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

const act = (over = {}) => ({
  id: 'x',
  name: 'Ride',
  type: 'Ride',
  startDateLocal: daysAgoIso(2),
  distanceM: 30000,
  movingTimeS: 7200,
  ...over
});

describe('plans.baselines', () => {
  it('computes per-group median speed and pre-plan weekly hours', () => {
    const start = mondayThisWeek().toISOString();
    const base = DS.plans.baselines(
      [
        act({ startDateLocal: daysAgoIso(10), distanceM: 40000, movingTimeS: 9000 }),
        act({ startDateLocal: daysAgoIso(12), distanceM: 40000, movingTimeS: 9000 }),
        act({ startDateLocal: daysAgoIso(14), distanceM: 40000, movingTimeS: 10800 }),
        act({ startDateLocal: daysAgoIso(20), movingTimeS: 3600 })
      ],
      start
    );
    expect(base.speedMedian.ride).toBeCloseTo(16, 1);
    expect(base.weeklyHours).toBeCloseTo((2.5 + 2.5 + 3 + 1) / 28 * 7, 1);
  });
});

describe('plans.isIntensity', () => {
  it('detects by name', () => {
    expect(DS.plans.isIntensity(act({ name: 'VO2 intervals' }), { speedMedian: { ride: 20 } })).toBe(true);
    expect(DS.plans.isIntensity(act({ name: 'Easy spin' }), { speedMedian: { ride: 20 } })).toBe(false);
  });

  it('detects by speed above baseline', () => {
    const fast = act({ name: 'Group ride', distanceM: 30000, movingTimeS: 3600 });
    expect(DS.plans.isIntensity(fast, { speedMedian: { ride: 20 } })).toBe(true);
    const slow = act({ name: 'Group ride', distanceM: 30000, movingTimeS: 7200 });
    expect(DS.plans.isIntensity(slow, { speedMedian: { ride: 20 } })).toBe(false);
  });
});

describe('plans.planWeeks', () => {
  it('creates monday-started weeks', () => {
    const century = DS.plans.PLANS.find((p) => p.id === 'century');
    const weeks = DS.plans.planWeeks(century, daysAgoIso(13));
    expect(weeks).toHaveLength(10);
    for (const w of weeks) expect(w.start.getDay()).toBe(1);
  });
});

describe('plans.statusOf', () => {
  it('classifies done, partial, missed', () => {
    const planned = { longKm: 50, intensity: 1 };
    expect(DS.plans.statusOf(planned, { hours: 5, longKm: 52, intensity: 1 }, 5)).toBe('done');
    expect(DS.plans.statusOf(planned, { hours: 5, longKm: 52, intensity: 0 }, 5)).toBe('partial');
    expect(DS.plans.statusOf(planned, { hours: 1, longKm: 10, intensity: 0 }, 5)).toBe('missed');
  });
});

describe('plans.assess (century, started 2 weeks ago)', () => {
  const plan = DS.plans.PLANS.find((p) => p.id === 'century');
  const start = (() => {
    const m = mondayThisWeek();
    m.setDate(m.getDate() - 14);
    return m;
  })();
  const at = (dayOffset, hour = 8) => {
    const d = new Date(start);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const baseRide = () => act({ distanceM: 40000, movingTimeS: 9000 });
  const history = [
    baseRide({ startDateLocal: at(-24) }),
    baseRide({ startDateLocal: at(-22) }),
    baseRide({ startDateLocal: at(-20) }),
    act({ startDateLocal: at(-18), movingTimeS: 3600 }),
    act({ name: 'Long ride', startDateLocal: at(1), distanceM: 52000, movingTimeS: 12600 }),
    act({ name: 'Intervals', startDateLocal: at(3), distanceM: 20000, movingTimeS: 3600 }),
    act({ startDateLocal: at(4), distanceM: 20000, movingTimeS: 5400 }),
    act({ startDateLocal: at(14), distanceM: 30000, movingTimeS: 7200 })
  ];

  const a = DS.plans.assess(plan, start.toISOString(), history, Date.now());

  it('resolves the current week (week 3 of 10)', () => {
    expect(a.current.index).toBe(2);
    expect(a.weeks[0].status).toBe('done');
    expect(a.weeks[1].status).toBe('missed');
    expect(a.weeks[3].status).toBe('future');
  });

  it('computes adherence from completed past weeks', () => {
    expect(a.adherence).toBe(33);
  });

  it('counts down to the race', () => {
    expect(a.raceInDays).toBeGreaterThan(40);
    expect(a.raceInDays).toBeLessThanOrEqual(56);
  });

  it('asks for the missing intensity session next', () => {
    expect(a.nextWorkout.kind).toBe('intensity');
  });

  it('uses hours multiplier against the athlete baseline', () => {
    expect(a.weeks[0].targetHours).toBeGreaterThan(0);
    expect(a.weeks[9].targetHours).toBeLessThan(a.weeks[0].targetHours);
  });
});

describe('plans.validateGeneratedPlan', () => {
  it('accepts a valid plan and pads short arrays', () => {
    const v = DS.plans.validateGeneratedPlan({ name: 'Century', weeks: 8, sport: 'ride', longKm: [50, 100], hoursMult: [1, 1.2], intensity: [1], tips: ['easy'] });
    expect(v.ok).toBe(true);
    expect(v.plan.llm).toBe(true);
    expect(v.plan.weeks).toBe(8);
    expect(v.plan.longKm).toHaveLength(8);
    expect(v.plan.longKm[7]).toBe(100);
    expect(v.plan.hoursMult).toHaveLength(8);
    expect(v.plan.intensity).toHaveLength(8);
    expect(v.plan.intensity[6]).toBe(1);
  });

  it('rejects out-of-range weeks and non-arrays', () => {
    expect(DS.plans.validateGeneratedPlan({ weeks: 2 }).ok).toBe(false);
    expect(DS.plans.validateGeneratedPlan({ weeks: 14 }).ok).toBe(false);
    expect(DS.plans.validateGeneratedPlan(null).ok).toBe(false);
  });

  it('clamps values', () => {
    const v = DS.plans.validateGeneratedPlan({ weeks: 4, longKm: [9999, -5, 40], hoursMult: [99], intensity: [99, 2] });
    expect(v.ok).toBe(true);
    expect(v.plan.longKm[0]).toBe(600);
    expect(v.plan.longKm[1]).toBe(0);
    expect(v.plan.hoursMult[0]).toBe(3);
    expect(v.plan.intensity[0]).toBe(6);
  });
});

describe('plans.buildTrainingSummary', () => {
  it('summarizes totals and recent weeks', () => {
    const acts = [
      act({ distanceM: 30000, movingTimeS: 3600, startDateLocal: daysAgoIso(1) }),
      act({ distanceM: 10000, movingTimeS: 1800, startDateLocal: daysAgoIso(20) })
    ];
    const s = DS.plans.buildTrainingSummary(acts, { weeks: 8 });
    expect(s).toContain('40 km');
    expect(s).toContain('ride:');
    expect(s).toContain('30km/1h');
  });
});

describe('plans.applyAdjustments', () => {
  it('updates future arrays in place', () => {
    const base = DS.plans.validateGeneratedPlan({ weeks: 6, longKm: [50, 60, 70, 80, 90, 100], hoursMult: [1, 1.1, 1.2, 1.3, 1.2, 1], intensity: [1, 1, 2, 2, 2, 1] }).plan;
    const next = DS.plans.applyAdjustments(base, { longKm: [40, 52], hoursMult: [0.9, 0.9, 1.1], intensity: [1, 1, 1, 2, 2, 1] });
    expect(next.longKm[0]).toBe(40);
    expect(next.longKm[1]).toBe(52);
    expect(next.longKm.slice(2)).toEqual([70, 80, 90, 100]);
    expect(next.hoursMult[0]).toBeCloseTo(0.9);
    expect(next.intensity[0]).toBe(1);
    expect(next.tips).toEqual(base.tips);
  });
});

describe('plans.assess fallbacks', () => {
  it('handles no history (no baseline hours)', () => {
    const plan = DS.plans.PLANS.find((p) => p.id === 'vo2');
    const a = DS.plans.assess(plan, mondayThisWeek().toISOString(), [], Date.now());
    expect(a.weeks[0].targetHours).toBeNull();
    expect(a.current.index).toBe(0);
  });

  it('long-run plans track run progression', () => {
    const plan = DS.plans.PLANS.find((p) => p.id === 'him703');
    expect(plan.runLongKm).toHaveLength(12);
    expect(plan.runLongKm[11]).toBeCloseTo(21.1);
  });
});
