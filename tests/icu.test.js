import { describe, expect, it } from 'vitest';
import '../src/content/ns.js';
import '../src/content/site.js';
import '../src/content/icu.js';

const DS = globalThis.DedupeStrava;

const icuAct = (over = {}) => ({
  id: 'i1001',
  name: 'Morning Ride',
  type: 'Ride',
  start_date_local: '2026-08-30T07:30:00',
  distance: 42300.5,
  moving_time: 5400,
  elapsed_time: 5700,
  total_elevation_gain: 512.4,
  device_name: 'Garmin Edge 840',
  trainer: false,
  has_heartrate: true,
  device_watts: true,
  average_cadence: 88,
  source: 'GARMIN',
  ...over
});

const res = (data, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data)
});

describe('icu.athleteIdFromUrl', () => {
  it('parses the athlete id from the activities tab route', () => {
    expect(DS.icu.athleteIdFromUrl('/athlete/i12345/activities')).toBe('i12345');
    expect(DS.icu.athleteIdFromUrl('/athlete/i99/fitness')).toBe('i99');
    expect(DS.icu.athleteIdFromUrl('/activities')).toBe(null);
  });
});

describe('icu.normalize', () => {
  it('maps the intervals.icu activity shape to the panel row shape', () => {
    const a = DS.icu.normalize(icuAct());
    expect(a).toMatchObject({
      id: 'i1001',
      name: 'Morning Ride',
      type: 'Ride',
      startDateLocal: '2026-08-30T07:30:00',
      distanceM: 42300.5,
      movingTimeS: 5400,
      elapsedTimeS: 5700,
      elevationM: 512.4,
      deviceName: 'Garmin Edge 840',
      hasHr: true,
      hasPower: true,
      hasCadence: true,
      manual: false,
      source: 'icu'
    });
  });

  it('flags manual activities and returns null without id', () => {
    expect(DS.icu.normalize(icuAct({ source: 'MANUAL' })).manual).toBe(true);
    expect(DS.icu.normalize({})).toBe(null);
  });
});

describe('icu.extractRows', () => {
  it('accepts a bare array or a wrapper object', () => {
    const a = icuAct({ id: 'i1' });
    expect(DS.icu.extractRows([a])).toHaveLength(1);
    expect(DS.icu.extractRows({ list: [a] })[0].id).toBe('i1');
    expect(DS.icu.extractRows({ activities: [a] })[0].id).toBe('i1');
    expect(DS.icu.extractRows({ rows: [a] })[0].id).toBe('i1');
    expect(DS.icu.extractRows({ foo: 'bar' })).toEqual([]);
    expect(DS.icu.extractRows(null)).toEqual([]);
  });

  it('guesses a sport type from text', () => {
    expect(DS.icu.guessType('Evening Ride')).toBe('Ride');
    expect(DS.icu.guessType('Morning Run')).toBe('Run');
    expect(DS.icu.guessType('Pool Swim')).toBe('Swim');
    expect(DS.icu.guessType('Weights')).toBe(null);
  });
});

describe('icu.scanAll', () => {
  it('accepts the {list} wrapper the Activities tab returns', async () => {
    const fetchImpl = async () => res({ list: [icuAct({ id: 'i1' }), icuAct({ id: 'i2' })] });
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athlete/i12345/activities',
      searchDateStart: '2026-08-01',
      searchDateEnd: '2026-09-05',
      delayMs: 0
    });
    expect(out.strategy).toBe('icu-api');
    expect(out.activities).toHaveLength(2);
  });

  it('throws a clear error when the feed is unavailable', async () => {
    const fetchImpl = async () => res({}, false, 403);
    await expect(
      DS.icu.scanAll({ fetchImpl, pathname: '/athlete/i1/activities', searchDateStart: '2026-08-01', delayMs: 0, retryDelayMs: 0, maxAttempts: 1 })
    ).rejects.toThrow(/403/);
  });

  it('fetches 92-day chunks newest-first and normalizes rows', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return res([icuAct({ id: 'i1' }), icuAct({ id: 'i2' })]);
    };
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athlete/i12345/activities',
      searchDateStart: '2026-08-01',
      searchDateEnd: '2026-09-05',
      delayMs: 0
    });
    expect(out.strategy).toBe('icu-api');
    expect(out.activities).toHaveLength(2);
    expect(calls[0]).toContain('/api/athlete/i12345/activities?');
    expect(calls[0]).toContain('oldest=2026-08-01');
    expect(calls[0]).toContain('newest=2026-09-05');
  });

  it('walks back in chunks until the oldest date', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return res([]);
    };
    await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athlete/i1/activities',
      searchDateStart: '2026-01-01',
      searchDateEnd: '2026-09-05',
      delayMs: 0,
      retryDelayMs: 0,
      maxAttempts: 1
    });
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls[calls.length - 1]).toContain('oldest=2026-01-01');
  });

  it('dedupes ids and stops after stopAfter (checked between chunks)', async () => {
    const fetchImpl = async () => res([icuAct({ id: 'i1' }), icuAct({ id: 'i1' }), icuAct({ id: 'i2' })]);
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athlete/i1/activities',
      searchDateStart: '2026-08-01',
      stopAfter: 1,
      delayMs: 0
    });
    expect(out.activities.map((a) => a.id)).toEqual(['i1', 'i2']);
  });

  it('falls back to /api/athlete when the URL has no athlete id', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.startsWith('/api/athlete?')) return res({ id: 'i777' });
      return res([]);
    };
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/activities',
      searchDateStart: '2026-09-01',
      delayMs: 0,
      retryDelayMs: 0,
      maxAttempts: 1
    });
    expect(calls[0]).toContain('/api/athlete?');
    expect(calls[1]).toContain('/api/athlete/i777/activities?');
    expect(out.strategy).toBe('icu-api');
  });

  it('stops early when aborted', async () => {
    const signal = { aborted: true };
    const fetchImpl = async () => res([icuAct()]);
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athlete/i1/activities',
      searchDateStart: '2025-01-01',
      signal,
      delayMs: 0
    });
    expect(out.stopped).toBe(true);
    expect(out.activities).toHaveLength(0);
  });
});

describe('icu.deleteActivity', () => {
  it('DELETEs /api/activity/{id} with the XSRF header when the cookie exists', async () => {
    const seen = [];
    const fetchImpl = async (url, opts) => {
      seen.push({ url, opts });
      return res({});
    };
    expect(DS.icu.xsrfToken({ cookie: 'other=1; XSRF-TOKEN=test-token-123' })).toBe('test-token-123');
    expect(DS.icu.xsrfToken({ cookie: 'other=1' })).toBe(null);
    const r = await DS.icu.deleteActivity('i1001', { fetchImpl, xsrf: 'test-token-123' });
    expect(r).toMatchObject({ id: 'i1001', ok: true, status: 200 });
    expect(seen[0].url).toBe('/api/activity/i1001');
    expect(seen[0].opts.method).toBe('DELETE');
    expect(seen[0].opts.headers['X-XSRF-TOKEN']).toBe('test-token-123');
  });

  it('reports failure on non-ok status', async () => {
    const fetchImpl = async () => res({}, false, 403);
    const r = await DS.icu.deleteActivity('i1', { fetchImpl, xsrf: null });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });
});

describe('icu.fetchActivityMeta', () => {
  it('normalizes the fetched activity', async () => {
    const fetchImpl = async () => res(icuAct({ id: 'i55' }));
    const meta = await DS.icu.fetchActivityMeta('i55', fetchImpl);
    expect(meta.id).toBe('i55');
    expect(meta.name).toBe('Morning Ride');
  });

  it('returns null on fetch failure', async () => {
    const fetchImpl = async () => res({}, false, 404);
    expect(await DS.icu.fetchActivityMeta('nope', fetchImpl)).toBe(null);
  });
});

describe('site detection', () => {
  it('defaults to strava off-intervals and builds per-site urls', () => {
    expect(DS.site.id).toBe('strava');
    expect(DS.SITES.intervals.activityUrl('i1001')).toBe('https://intervals.icu/activities/i1001');
    expect(DS.SITES.strava.activityUrl('123')).toBe('https://www.strava.com/activities/123');
    expect(DS.SITES.intervals.linkIdRe.test('/activities/i1001')).toBe(true);
    expect(DS.SITES.strava.parseIdInput('act 19995316027')).toBe('19995316027');
    expect(DS.SITES.intervals.parseIdInput(' i1001 ')).toBe('i1001');
  });
});
