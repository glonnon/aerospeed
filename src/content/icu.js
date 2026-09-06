(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

  function defaultFetch(url, opts) {
    return fetch(url, opts);
  }

  function athleteIdFromUrl(pathname) {
    const m = String(pathname || '').match(/\/athlete\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function apiGet(fetchImpl, path) {
    const res = await fetchImpl(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
    return res.json();
  }

  async function resolveAthleteId(opts = {}) {
    const fromUrl = athleteIdFromUrl(opts.pathname ?? (typeof location !== 'undefined' ? location.pathname : ''));
    if (fromUrl) return fromUrl;
    const me = await apiGet(opts.fetchImpl || defaultFetch, '/api/athlete');
    if (me && me.id != null) return String(me.id);
    throw new Error('Could not determine the intervals.icu athlete id — open the Activities tab of an athlete page.');
  }

  function normalize(a) {
    if (!a || a.id == null) return null;
    return {
      id: String(a.id),
      name: a.name ?? null,
      type: a.type || null,
      startDateLocal: a.start_date_local || a.start_date || null,
      distanceM: num(a.distance),
      movingTimeS: num(a.moving_time),
      elapsedTimeS: num(a.elapsed_time),
      elevationM: num(a.total_elevation_gain),
      deviceName: a.device_name || null,
      commute: null,
      gearId: a.gear_id ?? null,
      trainer: a.trainer ?? null,
      isPrivate: null,
      hasHr: a.has_heartrate ?? !!a.average_heartrate,
      hasPower: a.device_watts ?? (a.average_watts != null || a.icu_average_watts != null),
      hasCadence: a.average_cadence != null,
      averageHr: num(a.average_heartrate),
      averageWatts: num(a.average_watts ?? a.icu_average_watts),
      hasGps: !!a.has_latlng,
      manual: a.source === 'MANUAL',
      kudosCount: 0,
      commentCount: 0,
      photoCount: 0,
      prCount: 0,
      achievementCount: 0,
      polyline: null,
      source: 'icu'
    };
  }

  const CHUNK_MS = 92 * 86400000;
  const INCREMENTAL_MS = 92 * 86400000;

  async function scanAll(opts = {}) {
    const fetchImpl = opts.fetchImpl || defaultFetch;
    const settings = opts.settings || DS.settingsStore?.get() || {};
    const delayMs = opts.delayMs ?? 150;
    const athleteId = await resolveAthleteId(opts);

    let oldestMs;
    if (opts.searchDateStart) oldestMs = Date.parse(opts.searchDateStart);
    else if (settings.scanWindowDays > 0) oldestMs = Date.now() - settings.scanWindowDays * 86400000;
    else if (opts.knownIds) oldestMs = Date.now() - INCREMENTAL_MS;
    else oldestMs = Date.parse('1980-01-01');
    const newestMs = opts.searchDateEnd ? Date.parse(opts.searchDateEnd) + 86399999 : Date.now();

    const maxChunks = Math.max(1, opts.maxPages || 40);
    const seen = new Set();
    if (opts.knownIds) for (const id of opts.knownIds) seen.add(String(id));
    const activities = [];
    let chunks = 0;
    let stopped = false;

    let end = newestMs;
    while (end > oldestMs && chunks < maxChunks) {
      if (opts.signal?.aborted) {
        stopped = true;
        break;
      }
      const start = Math.max(oldestMs, end - CHUNK_MS);
      const path = `/api/athlete/${encodeURIComponent(athleteId)}/activities?oldest=${isoDay(start)}&newest=${isoDay(end)}`;
      const data = await apiGet(fetchImpl, path);
      chunks += 1;
      let added = 0;
      for (const raw of Array.isArray(data) ? data : []) {
        const a = normalize(raw);
        if (!a || seen.has(a.id)) continue;
        seen.add(a.id);
        activities.push(a);
        added += 1;
      }
      opts.onProgress?.({ page: chunks, loaded: activities.length, strategy: 'icu-api' });
      if (opts.knownIds && added === 0) break;
      if (opts.stopAfter && activities.length >= opts.stopAfter) break;
      if (start <= oldestMs) break;
      end = start - 86400000;
      if (delayMs && end > oldestMs) await sleep(delayMs);
    }

    return {
      activities,
      pages: chunks,
      strategy: 'icu-api',
      truncated: end > oldestMs && !stopped,
      stopped,
      hasWebToken: false
    };
  }

  function xsrfToken(doc = typeof document !== 'undefined' ? document : null) {
    const m = (doc?.cookie || '').match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function deleteActivity(id, opts = {}) {
    const fetchImpl = opts.fetchImpl || defaultFetch;
    try {
      const headers = { Accept: 'application/json' };
      const xsrf = opts.xsrf !== undefined ? opts.xsrf : xsrfToken();
      if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
      const res = await fetchImpl(`/api/activity/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers
      });
      return { id: String(id), ok: !!res.ok, status: res.status };
    } catch (e) {
      return { id: String(id), ok: false, error: String(e) };
    }
  }

  async function deleteMany(ids, opts = {}) {
    const { onProgress, delayMs = 1200, shouldAbort, ...rest } = opts;
    const results = [];
    for (let i = 0; i < ids.length; i++) {
      if (shouldAbort?.()) break;
      const r = await deleteActivity(ids[i], rest);
      results.push(r);
      if (r.ok) await DS.deleter?.logDeletion?.({ id: r.id, site: 'intervals' });
      onProgress?.({ done: i + 1, total: ids.length, last: r });
      if (i < ids.length - 1 && delayMs) await sleep(delayMs);
    }
    return results;
  }

  async function fetchActivityMeta(id, fetchImpl = defaultFetch) {
    try {
      return normalize(await apiGet(fetchImpl, `/api/activity/${encodeURIComponent(id)}`));
    } catch (e) {
      DS.debug?.('icu meta fetch failed', e);
      return null;
    }
  }

  DS.icu = {
    scanAll,
    normalize,
    resolveAthleteId,
    athleteIdFromUrl,
    deleteActivity,
    deleteMany,
    fetchActivityMeta,
    xsrfToken
  };
})();
