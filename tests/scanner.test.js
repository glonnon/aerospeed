// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import '../src/content/scanner.js';

const DS = globalThis.DedupeStrava;

const PROPS_HTML = `
<html><body>
  <div data-react-class="ActivityRow" data-react-props='{"id":123,"name":"Morning Ride","type":"Ride","start_date_local":"2026-05-01T08:00:00Z","distance":25400,"moving_time":4200,"elapsed_time":4500,"total_elevation_gain":310,"device_name":"Garmin Edge 530","kudos_count":3,"comment_count":1,"photo_count":2,"pr_count":4,"achievement_count":5,"has_heartrate":true,"device_watts":true,"average_cadence":88.1,"map":{"summary_polyline":"abc123"}}'></div>
  <div data-react-class="ActivityRow" data-react-props='not json'></div>
</body></html>`;

const ROWS_HTML = `
<html><body>
  <h2>May 2026</h2>
  <table>
    <thead><tr><th>Activity</th><th>Date</th><th>Distance</th><th>Pace</th><th>Time</th><th>Elev Gain</th></tr></thead>
    <tbody>
      <tr>
        <td><a href="/activities/111">Morning Run</a></td>
        <td>May 2</td>
        <td>10.5 km</td>
        <td>4:50 /km</td>
        <td>50:55</td>
        <td>120 m</td>
      </tr>
      <tr>
        <td><svg><use href="#icon-ride"></use></svg><a href="https://www.strava.com/activities/222">Lunch Ride</a></td>
        <td>May 3</td>
        <td>6.2 mi</td>
        <td>18.2 km/h</td>
        <td>1:05:00</td>
        <td>300 m</td>
      </tr>
      <tr><td><a href="/activities/333">Indoor Row</a></td><td>May 4</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
    </tbody>
  </table>
</body></html>`;

describe('scanner.parseFragment (embedded react props)', () => {
  const acts = DS.scanner.parseFragment(PROPS_HTML);
  it('parses and normalizes props', () => {
    expect(acts).toHaveLength(1);
    const a = acts[0];
    expect(a.id).toBe('123');
    expect(a.name).toBe('Morning Ride');
    expect(a.type).toBe('Ride');
    expect(a.distanceM).toBe(25400);
    expect(a.movingTimeS).toBe(4200);
    expect(a.elevationM).toBe(310);
    expect(a.deviceName).toBe('Garmin Edge 530');
    expect(a.hasHr).toBe(true);
    expect(a.hasPower).toBe(true);
    expect(a.hasCadence).toBe(true);
    expect(a.prCount).toBe(4);
    expect(a.polyline).toBe('abc123');
    expect(a.source).toBe('props');
  });
  it('skips malformed props', () => {
    expect(acts.some((a) => a.id === undefined)).toBe(false);
  });
});

describe('scanner.parseFragment (dom rows)', () => {
  const acts = DS.scanner.parseFragment(ROWS_HTML);
  it('finds all activity rows', () => {
    expect(acts.map((a) => a.id)).toEqual(['111', '222', '333']);
  });
  it('extracts metrics from cells', () => {
    const run = acts[0];
    expect(run.name).toBe('Morning Run');
    expect(run.distanceM).toBeCloseTo(10500);
    expect(run.movingTimeS).toBe(50 * 60 + 55);
    expect(run.elevationM).toBe(120);
    expect(run.type).toBeNull();
  });
  it('parses 1h+ times and miles', () => {
    const ride = acts[1];
    expect(ride.movingTimeS).toBe(3600 + 5 * 60);
    expect(Math.round(ride.distanceM)).toBe(Math.round(6.2 * 1609.344));
    expect(ride.type).toBe('ride');
  });
  it('derives dates from month headers', () => {
    const dates = acts.map((a) => a.startDateLocal);
    expect(dates[0]).toMatch(/^2026-05-02/);
    expect(dates[1]).toMatch(/^2026-05-03/);
  });
  it('tolerates missing metrics', () => {
    const row = acts[2];
    expect(row.distanceM).toBeNull();
    expect(row.movingTimeS).toBeNull();
  });
});

describe('scanner.scanAll', () => {
  it('paginates until an empty page and dedupes by id', async () => {
    const pages = [
      `<div data-react-class="ActivityRow" data-react-props='{"id":1,"name":"A","distance":1000,"moving_time":600,"start_date_local":"2026-01-01T10:00:00Z"}'></div>
       <div data-react-class="ActivityRow" data-react-props='{"id":2,"name":"B","distance":1000,"moving_time":600,"start_date_local":"2026-01-01T10:00:00Z"}'></div>`,
      `<div data-react-class="ActivityRow" data-react-props='{"id":2,"name":"B dup","distance":1000,"moving_time":600,"start_date_local":"2026-01-01T10:00:00Z"}'></div>
       <div data-react-class="ActivityRow" data-react-props='{"id":3,"name":"C","distance":1000,"moving_time":600,"start_date_local":"2026-01-01T10:00:00Z"}'></div>`,
      '<p>no more activities</p>'
    ];
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      return { ok: true, text: async () => pages[calls.length - 1] };
    };
    const progress = [];
    const res = await DS.scanner.scanAll({
      fetchImpl,
      delayMs: 0,
      origin: 'https://www.strava.com',
      onProgress: (p) => progress.push(p)
    });
    expect(res.pages).toBe(3);
    expect(res.truncated).toBe(false);
    expect(res.activities.map((a) => a.id)).toEqual(['1', '2', '3']);
    expect(progress.at(-1)).toEqual({ page: 3, loaded: 3, strategy: 'ajax' });
    expect(calls[0]).toContain('/athlete/training_activities');
    expect(calls[0]).toContain('new_page=true');
    expect(calls[0]).toContain('page=1');
  });

  it('passes an explicit date filter to the endpoint', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, url: String(url), headers: { get: () => 'application/json' }, text: async () => '{"models":[]}' };
    };
    await DS.scanner.scanAll({
      fetchImpl,
      delayMs: 0,
      origin: 'https://www.strava.com',
      searchDateStart: '2026-06-01'
    });
    expect(calls[0]).toContain('search_date_start=2026-06-01');
  });

  it('stops at the date boundary (newest-first) and keeps only in-range rows', async () => {
    const cutoff = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    const mk = (id, daysAgo) => ({
      id,
      name: `A${id}`,
      sport_type: 'Ride',
      start_time: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      distance_raw: 1000,
      moving_time_raw: 600
    });
    const page1 = JSON.stringify({ models: [mk(1, 30), mk(2, 60)] });
    const page2 = JSON.stringify({ models: [mk(3, 90)] });
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(1);
      return {
        ok: true,
        status: 200,
        url: String(url),
        headers: { get: () => 'application/json' },
        text: async () => (calls.length === 1 ? page1 : page2)
      };
    };
    const res = await DS.scanner.scanAll({
      fetchImpl,
      delayMs: 0,
      origin: 'https://www.strava.com',
      searchDateStart: cutoff
    });
    expect(calls).toHaveLength(1);
    expect(res.activities.map((a) => a.id)).toEqual(['1']);
  });

  it('keeps scanning when a page has no dated rows', async () => {
    const cutoff = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    const pages = [
      JSON.stringify({ models: [{ id: 9, name: 'Mystery', sport_type: 'Ride' }] }),
      JSON.stringify({ models: [{ id: 10, name: 'Recent', sport_type: 'Ride', start_time: new Date().toISOString(), distance_raw: 1, moving_time_raw: 1 }] }),
      JSON.stringify({ models: [] })
    ];
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(1);
      return { ok: true, status: 200, url: String(url), headers: { get: () => 'application/json' }, text: async () => pages[calls.length - 1] };
    };
    const res = await DS.scanner.scanAll({
      fetchImpl,
      delayMs: 0,
      origin: 'https://www.strava.com',
      searchDateStart: cutoff
    });
    expect(calls).toHaveLength(3);
    expect(res.activities.map((a) => a.id)).toEqual(['9', '10']);
  });

  it('seeds known ids and returns only new activities (incremental refresh)', async () => {
    const mk = (id) => ({
      id,
      name: `A${id}`,
      sport_type: 'Ride',
      start_time: new Date(Date.now() - id * 3600000).toISOString(),
      distance_raw: 1000,
      moving_time_raw: 600
    });
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(1);
      return {
        ok: true,
        status: 200,
        url: String(url),
        headers: { get: () => 'application/json' },
        text: async () => (calls.length === 1 ? JSON.stringify({ models: [mk(2), mk(1)] }) : JSON.stringify({ models: [] }))
      };
    };
    const res = await DS.scanner.scanAll({
      fetchImpl,
      delayMs: 0,
      origin: 'https://www.strava.com',
      knownIds: new Set(['1'])
    });
    expect(res.activities.map((a) => a.id)).toEqual(['2']);
    expect(calls).toHaveLength(2);
  });

  it('honors an end-date bound (searchDateEnd)', async () => {
    const mk = (id, daysAgo) => ({
      id,
      name: `A${id}`,
      sport_type: 'Ride',
      start_time: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      distance_raw: 1000,
      moving_time_raw: 600
    });
    const page1 = JSON.stringify({ models: [mk(1, 10), mk(2, 40), mk(3, 5)] });
    const page2 = JSON.stringify({ models: [] });
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, url: String(url), headers: { get: () => 'application/json' }, text: async () => (calls.length === 1 ? page1 : page2) };
    };
    const end = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const res = await DS.scanner.scanAll({ fetchImpl, delayMs: 0, origin: 'https://www.strava.com', searchDateEnd: end });
    expect(res.activities.map((a) => a.id)).toEqual(['2']);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('search_date_end=');
  });

  it('fetchActivityMeta pulls name and date from the activity page', async () => {
    const html = `
      <html><head><title> Lunch Ride | Strava </title></head><body>
      <script>window.page = {"start_date_local":"2026-08-30T12:00:00+0000","some":"thing"};</script>
      <a href="/activities/555">x</a>
      </body></html>`;
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => html });
    const meta = await DS.scanner.fetchActivityMeta('555', fetchImpl);
    expect(meta.id).toBe('555');
    expect(meta.name).toBe('Lunch Ride');
    expect(meta.startDateLocal).toBe('2026-08-30T12:00:00.000Z');
  });

  it('fetchActivityMeta returns null on http errors', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });
    expect(await DS.scanner.fetchActivityMeta('1', fetchImpl)).toBeNull();
  });

  it('fetchActivityDetail extracts PRs, device, HR, power, polyline', async () => {
    const html = `
      <html><head><title>Ride | Strava</title></head><body>
      <script>
        window.pageView = {
          "pr_count": 3, "achievement_count": 5, "kudos_count": 2, "comment_count": 1,
          "distance": 25400, "moving_time": 4200, "total_elevation_gain": 310,
          "device_name": "Garmin Edge 830", "has_heartrate": true,
          "device_watts": true, "average_cadence": 88,
          "summary_polyline": "abc123"
        };
      </script>
      </body></html>`;
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => html });
    const d = await DS.scanner.fetchActivityDetail('777', fetchImpl);
    expect(d.prCount).toBe(3);
    expect(d.achievementCount).toBe(5);
    expect(d.kudosCount).toBe(2);
    expect(d.commentCount).toBe(1);
    expect(d.deviceName).toBe('Garmin Edge 830');
    expect(d.hasHr).toBe(true);
    expect(d.hasPower).toBe(true);
    expect(d.hasCadence).toBe(true);
    expect(d.distanceM).toBe(25400);
    expect(d.movingTimeS).toBe(4200);
    expect(d.polyline).toBe('abc123');
  });

  it('fetchActivityDetail returns null on http error', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404 });
    expect(await DS.scanner.fetchActivityDetail('1', fetchImpl)).toBeNull();
  });

  it('throws on http errors', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403 });
    await expect(
      DS.scanner.scanAll({ fetchImpl, delayMs: 0, origin: 'https://www.strava.com' })
    ).rejects.toThrow(/403/);
  });

  it('stops after stopAfter activities are loaded (recent scope)', async () => {
    const model = (id) => ({ id, name: `A${id}`, sport_type: 'Ride', start_time: '2026-05-01T08:00:00+0000', distance_raw: 1000, moving_time_raw: 600 });
    const page = (from) => JSON.stringify({ models: [model(from), model(from + 1), model(from + 2)] });
    const calls = [];
    const fetchImpl = async () => {
      calls.push(1);
      return {
        ok: true,
        status: 200,
        url: 'u',
        headers: { get: () => 'application/json' },
        text: async () => page(calls.length * 3 - 3)
      };
    };
    const res = await DS.scanner.scanAll({ fetchImpl, delayMs: 0, stopAfter: 4, origin: 'https://www.strava.com' });
    expect(res.stopped).toBe(false);
    expect(res.activities).toHaveLength(6);
    expect(calls).toHaveLength(2);
  });

  it('retries once on 429/5xx before giving up', async () => {
    const models = { models: [{ id: 5, name: 'X', sport_type: 'Ride', start_time: '2026-05-01T08:00:00+0000', distance_raw: 1, moving_time_raw: 1 }] };
    const calls = [];
    const fetchImpl = async () => {
      calls.push(1);
      if (calls.length === 1) return { ok: false, status: 429 };
      return {
        ok: true,
        status: 200,
        url: 'u',
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(models)
      };
    };
    const res = await DS.scanner.scanAll({ fetchImpl, delayMs: 0, retryDelayMs: 0, origin: 'https://www.strava.com' });
    expect(calls).toHaveLength(3);
    expect(res.activities).toHaveLength(1);
  });

  it('keeps partial results when the abort signal fires', async () => {
    const page = (ids) =>
      JSON.stringify({ models: ids.map((id) => ({ id, name: `A${id}`, sport_type: 'Ride', start_time: '2026-05-01T08:00:00+0000', distance_raw: 1000, moving_time_raw: 600 })) });
    const signal = { aborted: false };
    const calls = [];
    const fetchImpl = async () => {
      calls.push(1);
      if (calls.length >= 2) signal.aborted = true;
      return {
        ok: true,
        status: 200,
        url: 'u',
        headers: { get: () => 'application/json' },
        text: async () => page([calls.length])
      };
    };
    const res = await DS.scanner.scanAll({ fetchImpl, signal, delayMs: 0, origin: 'https://www.strava.com' });
    expect(res.stopped).toBe(true);
    expect(res.activities.map((a) => a.id)).toEqual(['1', '2']);
  });
});

describe('scanner numeric parsing', () => {
  it('parses times, distances, elevation', () => {
    expect(DS.scanner.parseTimeToSec('1:02:03')).toBe(3723);
    expect(DS.scanner.parseTimeToSec('45:00')).toBe(2700);
    expect(DS.scanner.parseDistanceToM('12.5 km')).toBe(12500);
    expect(Math.round(DS.scanner.parseDistanceToM('3.1 mi'))).toBe(4989);
    expect(DS.scanner.parseElevToM('800 m')).toBe(800);
    expect(Math.round(DS.scanner.parseElevToM('100 ft'))).toBe(30);
  });
});

describe('scanner.redact', () => {
  it('masks JWTs and access tokens', () => {
    const out = DS.scanner.redact(
      'var t = "eyJhbGciOiJI.abc123.def456"; access_token: "longsecretvalue" auth_token":"anothersecret1"'
    );
    expect(out).toContain('[REDACTED_JWT]');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('longsecretvalue');
    expect(out).not.toContain('eyJhbGciOiJI');
  });
});

describe('scanner.parseGenericLinks (unknown markup)', () => {
  const GENERIC_HTML = `
  <html><body><div class="feed">
    <div class="activity-item">
      <a href="/activities/777">Tempo Run</a>
      <span>May 2, 2026 · 8.0 km · 42:10 · 85 m</span>
    </div>
    <div class="activity-item">
      <a href="https://www.strava.com/activities/778">Recovery</a>
      <span>2026-05-03T06:30:00Z · 5.2 km · 30:00</span>
    </div>
    <div><a href="/activities/777">dup link same id</a></div>
  </div></body></html>`;

  it('extracts activities from arbitrary containers with text metrics', () => {
    const acts = DS.scanner.parseFragment(GENERIC_HTML);
    expect(acts.map((a) => a.id)).toEqual(['777', '778']);
    expect(acts[0].name).toBe('Tempo Run');
    expect(acts[0].distanceM).toBeCloseTo(8000);
    expect(acts[0].movingTimeS).toBe(42 * 60 + 10);
    expect(acts[0].elevationM).toBe(85);
    expect(String(acts[0].startDateLocal)).toMatch(/^2026-05-02/);
    expect(acts[1].startDateLocal).toMatch(/^2026-05-03/);
    expect(acts[1].source).toBe('generic');
  });
});

describe('scanner.parseJsonModels (live endpoint format)', () => {
  const JSON_PAGE = JSON.stringify({
    models: [
      {
        id: 19995316027,
        id_str: '19995316027',
        name: 'Morning Mountain Bike Ride',
        sport_type: 'MountainBikeRide',
        display_type: 'Mountain Bike Ride',
        activity_type_display_name: 'Ride',
        private: false,
        start_date: 'Tue, 9/1/2026',
        start_time: '2026-09-01T16:33:03+0000',
        distance: '16.71',
        distance_raw: 26893.8,
        long_unit: 'miles',
        short_unit: 'mi',
        moving_time: '2:14:03',
        moving_time_raw: 8043,
        elapsed_time: '2:31:38',
        elapsed_time_raw: 9098,
        trainer: false,
        has_latlng: true,
        commute: false,
        elevation_gain: '1,975',
        elevation_unit: 'ft',
        elevation_gain_raw: 602.0,
        activity_url: 'https://www.strava.com/activities/19995316027'
      }
    ]
  });

  it('parses the models JSON with raw metric fields', () => {
    const acts = DS.scanner.parseFragment(JSON_PAGE);
    expect(acts).toHaveLength(1);
    const a = acts[0];
    expect(a.id).toBe('19995316027');
    expect(a.name).toBe('Morning Mountain Bike Ride');
    expect(a.type).toBe('MountainBikeRide');
    expect(a.distanceM).toBeCloseTo(26893.8);
    expect(a.movingTimeS).toBe(8043);
    expect(a.elapsedTimeS).toBe(9098);
    expect(a.elevationM).toBe(602);
    expect(a.hasGps).toBe(true);
    expect(a.source).toBe('json');
    expect(a.startDateLocal).toBe('2026-09-01T16:33:03.000Z');
  });

  it('returns empty array for invalid or non-model JSON', () => {
    expect(DS.scanner.parseJsonModels('not json')).toEqual([]);
    expect(DS.scanner.parseJsonModels('{"foo":1}')).toEqual([]);
  });

  it('scanAll reads a full JSON page stream end-to-end', async () => {
    const page1 = JSON.stringify({
      models: [
        { id: 1, name: 'A', sport_type: 'Ride', start_time: '2026-05-01T08:00:00+0000', distance_raw: 1000, moving_time_raw: 600, elapsed_time_raw: 600 },
        { id: 2, name: 'B', sport_type: 'Ride', start_time: '2026-05-01T08:02:00+0000', distance_raw: 1000, moving_time_raw: 600, elapsed_time_raw: 600 }
      ]
    });
    const page2 = JSON.stringify({ models: [] });
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        url: String(url),
        headers: { get: () => 'application/json; charset=utf-8' },
        text: async () => (calls.length === 1 ? page1 : page2)
      };
    };
    const res = await DS.scanner.scanAll({ fetchImpl, delayMs: 0, origin: 'https://www.strava.com' });
    expect(res.strategy).toBe('ajax');
    expect(res.activities.map((a) => a.id)).toEqual(['1', '2']);
    expect(res.pages).toBe(2);
  });
});

describe('scanner web-API strategy', () => {
  it('prefers /api/v3 when the page embeds a web token', async () => {
    document.body.innerHTML = `<script>var pageview = {"access_token":"eyJfake.token.parts"};</script>`;
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      const page = Number(new URL(url).searchParams.get('page'));
      const data =
        page === 1
          ? [{ id: 9, name: 'API Ride', sport_type: 'Ride', start_date_local: '2026-05-01T08:00:00Z', distance: 1234, moving_time: 600, elapsed_time: 700, total_elevation_gain: 12, map: { summary_polyline: 'xyz' } }]
          : [];
      return { ok: true, status: 200, url: String(url), headers: { get: () => 'application/json' }, json: async () => data };
    };

    const res = await DS.scanner.scanAll({ fetchImpl, delayMs: 0, origin: 'https://www.strava.com' });
    expect(res.strategy).toBe('web-api');
    expect(res.hasWebToken).toBe(true);
    expect(res.activities).toHaveLength(1);
    expect(res.activities[0].id).toBe('9');
    expect(res.activities[0].source).toBe('props');
    expect(res.activities[0].polyline).toBe('xyz');
    expect(calls[0]).toContain('/api/v3/athlete/activities');
    expect(calls[0]).toContain('page=1');
    expect(calls.some((c) => c.includes('training_activities'))).toBe(false);
  });

  it('reports diagnostics when everything fails and no token exists', async () => {
    document.body.innerHTML = '<p>empty</p>';
    const fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      url: 'https://www.strava.com/login',
      headers: { get: () => 'text/html' },
      text: async () => '<html><head><title>Log in</title></head><body>Sign in with email</body></html>'
    });
    const res = await DS.scanner.scanAll({ fetchImpl, delayMs: 0, origin: 'https://www.strava.com' });
    expect(res.activities).toHaveLength(0);
    expect(res.strategy).toBe('ajax');
    expect(res.htmlDiagnostics.finalUrl).toBe('https://www.strava.com/login');
    expect(res.htmlDiagnostics.counts.loginMarkers).toBeGreaterThan(0);
    expect(res.hasWebToken).toBe(false);
  });

  it('normalizeApi maps official API activity fields', () => {
    const a = DS.scanner.normalizeApi({
      id: 55,
      name: 'Run',
      type: 'Run',
      start_date_local: '2026-01-02T07:10:00Z',
      distance: 5000,
      moving_time: 1500,
      elapsed_time: 1600,
      total_elevation_gain: 40,
      average_heartrate: 150,
      device_watts: false,
      kudos_count: 2,
      achievement_count: 1,
      map: { summary_polyline: 'poly' }
    });
    expect(a.id).toBe('55');
    expect(a.distanceM).toBe(5000);
    expect(a.movingTimeS).toBe(1500);
    expect(a.hasHr).toBe(true);
    expect(a.achievementCount).toBe(1);
    expect(a.polyline).toBe('poly');
  });
});
