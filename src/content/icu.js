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

  // The Activities tab loads its list over a WebSocket; the REST /api/athlete/{id}/
  // activities call is what *triggers* that push and its body is ignored by the app.
  // It can return a bare array or a wrapper ({list}, {activities}, {rows}, ...).
  function extractRows(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    for (const k of ['list', 'activities', 'rows', 'items']) {
      if (Array.isArray(data[k])) return data[k];
    }
    return [];
  }

  function triggerToken() {
    return 'm' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function apiGet(fetchImpl, path) {
    return fetchImpl(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  }

  function guessType(text) {
    const t = String(text || '').toLowerCase();
    if (/(run|jog|trail run|virtual run|treadmill|track run|ultra)/.test(t)) return 'Run';
    if (/(ride|bike|biking|cycling|velo|road bike|mtb|mountain bike|gravel|ebike|e-bike|virtual ride|indoor cycling|trainer ride|cyclocross|enduro|bikepack|bike ride)/.test(t)) return 'Ride';
    if (/(swim|swimming|pool swim|open water|swimrun|lap swim)/.test(t)) return 'Swim';
    if (/(hike|walk|walking|nordic|trail hike)/.test(t)) return 'Walk';
    return null;
  }

  // Walk up from the activity link until we land on the element that actually
  // carries the row's metrics. intervals.icu nests the name in a cell, so the
  // nearest div/li is just the name cell — we keep climbing until the text
  // contains a distance, or we hit a table row or the row container.
  function rowAround(link) {
    let el = link;
    for (let i = 0; el && i < 8; i++) {
      el = el.parentElement;
      if (!el || el === document.body) break;
      const tag = el.tagName;
      const t = String(el.textContent || '');
      if (tag === 'TR' || /\d[\d.,]*\s*(km|mi)\b/i.test(t) || /(^|[\s·])\d{1,3}:\d{2}:\d{2}/.test(t)) {
        return el;
      }
    }
    return link.parentElement || link;
  }

  // Failsafe when the REST feed comes back empty: read whatever the Activities
  // tab has already rendered on the page. intervals.icu renders each activity as
  // <a class="activity-link" href="/activities/{id}"> inside a row, with columns
  // for date, type, distance and time. Parsing the row text is the reliable way
  // to recover metrics for the visible duplicates.
  function scrapeDom() {
    if (typeof document === 'undefined' || !document.querySelector) return [];
    const out = [];
    const seen = new Set();
    const links = document.querySelectorAll('a[href*="/activities/"]');
    for (const link of links) {
      const m = (link.getAttribute('href') || '').match(/\/activities\/([a-zA-Z0-9_-]+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const linkText = (link.textContent || '');
      const row = rowAround(link);
      const txt = String(row?.textContent || linkText);
      const hintBits = [row?.className, link.getAttribute('title')];
      if (row) {
        for (const el of row.querySelectorAll('[title], svg title')) {
          const h = el.getAttribute?.('title') || el.textContent || '';
          if (h && h.length < 80) hintBits.push(h);
        }
      }
      const typeTxt = txt + ' ' + hintBits.join(' ');
      const dMatch = txt.match(/(\d{4})-(\d{2})-(\d{2})/);
      const timeEl = row?.querySelector('time[datetime]');
      let startDateLocal = timeEl ? timeEl.getAttribute('datetime') : null;
      if (!startDateLocal && dMatch) startDateLocal = `${dMatch[1]}-${dMatch[2]}-${dMatch[3]}T12:00:00`;

      const distMatch = txt.match(/([\d][\d.,]*)\s*(km|mi)\b/i);
      let distanceM = null;
      if (distMatch) {
        const n = Number(String(distMatch[1]).replace(/,/g, ''));
        if (Number.isFinite(n)) distanceM = /mi|mile/i.test(distMatch[2]) ? n * 1609.344 : n * 1000;
      }

      // Duration h:mm:ss — prefer the colon-time with two separators (hours
      // present), which in the list is the moving time, not the start time.
      let movingTimeS = null;
      const hmmss = txt.match(/(?:^|\s)(\d{1,3}):(\d{2}):(\d{2})(?:\s|$)/);
      const hmm = txt.match(/(?:^|\s)(\d{1,3}):(\d{2})(?:\s|$)/);
      const part = hmmss ? [hmmss[1], hmmss[2], hmmss[3]] : hmm ? [hmm[1], hmm[2], 0] : null;
      if (part) {
        const hrs = Number(part[0]);
        const mins = Number(part[1]);
        if (hrs < 24 && mins < 60 && (hrs > 0 || hmmss)) movingTimeS = hrs * 3600 + mins * 60 + Number(part[2] || 0);
      }

      out.push({
        ...blank(),
        id: m[1],
        name: (linkText || '').trim() && linkText.trim() !== m[1] ? linkText.trim() : null,
        type: guessType(typeTxt) || 'Other',
        startDateLocal,
        distanceM,
        movingTimeS,
        source: 'icu-dom'
      });
    }
    return out;
  }

  function blank() {
    return {
      name: null,
      type: null,
      startDateLocal: null,
      distanceM: null,
      movingTimeS: null,
      elapsedTimeS: null,
      elevationM: null,
      deviceName: null,
      commute: null,
      gearId: null,
      trainer: null,
      isPrivate: null,
      hasHr: false,
      hasPower: false,
      hasCadence: false,
      hasGps: false,
      manual: false,
      kudosCount: 0,
      commentCount: 0,
      photoCount: 0,
      prCount: 0,
      achievementCount: 0,
      polyline: null,
      source: 'icu'
    };
  }

  async function resolveAthleteId(opts = {}) {
    const fetchImpl = opts.fetchImpl || defaultFetch;
    const fromUrl = athleteIdFromUrl(opts.pathname ?? (typeof location !== 'undefined' ? location.pathname : ''));
    if (fromUrl) return fromUrl;

    // The app bootstraps the logged-in athlete with GET /api/athlete (same
    // session cookies). Tolerate common shapes: a bare athlete, {athlete: …},
    // {data: …} or a one-element array.
    const res = await apiGet(fetchImpl, '/api/athlete?deviceClass=DESKTOP');
    if (!res.ok) throw new Error(`Intervals.icu /api/athlete returned HTTP ${res.status} — session cookie missing?`);
    let d = null;
    try {
      d = await res.json();
    } catch (e) {
      const text = await res.text().catch(() => '');
      const m = String(text).match(/"(?:id)"\s*:\s*"([^"]+)"/);
      if (m) return String(m[1]);
      throw new Error('Intervals.icu /api/athlete did not return JSON');
    }
    const id = d?.id ?? d?.athlete?.id ?? d?.data?.id ?? (Array.isArray(d) ? d[0]?.id : null);
    if (id == null) throw new Error('Intervals.icu /api/athlete response had no id');
    return String(id);
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

  // One pass: merge whatever the page has already rendered (DOM, from the WS)
  // with fresh REST chunks. Returns the FULL set seen this pass (including
  // already-known ids) so callers can upgrade cached sparse rows to fuller ones.
  async function attemptScan(opts, fetchImpl, settings, delayMs, known, oldestMs, newestMs) {
    let chunks = 0;
    let stopped = false;
    let error = null;
    const byId = new Map();

    // 1) Seed from whatever the page already renders (visible duplicates).
    if (typeof document !== 'undefined') {
      for (const a of scrapeDom()) {
        if (!a || !a.id) continue;
        const prev = byId.get(a.id);
        if (!prev || (prev.distanceM == null && a.distanceM != null)) byId.set(a.id, a);
      }
    }
    const domCount = byId.size;

    if (opts.signal?.aborted) stopped = true;

    // 2) Try the REST feed for the full window (may be empty — it also just
    //    triggers the WebSocket push the page consumes).
    if (!opts.signal?.aborted) {
      let athleteId = null;
      let end = newestMs;
      const maxChunks = Math.max(1, opts.maxPages || 40);
      let newCount = 0;
      while (end > oldestMs && chunks < maxChunks) {
        if (opts.signal?.aborted) {
          stopped = true;
          break;
        }
        const start = Math.max(oldestMs, end - CHUNK_MS);
        let rows = [];
        let res = null;
        try {
          if (athleteId == null) athleteId = await resolveAthleteId(opts);
          const path = `/api/athlete/${encodeURIComponent(athleteId)}/activities?oldest=${isoDay(start)}&newest=${isoDay(end)}&limit=200&token=${triggerToken()}`;
          res = await apiGet(fetchImpl, path);
          if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
          const data = await res.json().catch(() => null);
          rows = extractRows(data).map(normalize).filter(Boolean);
        } catch (e) {
          error = e;
          if (res && res.status >= 500) break;
          break;
        }
        chunks += 1;
        for (const a of rows) {
          if (!a) continue;
          const prev = byId.get(a.id);
          if (prev) {
            // Prefer the richer copy (REST rows carry metrics the DOM may lack).
            if (prev.distanceM == null && a.distanceM != null) byId.set(a.id, a);
          } else {
            byId.set(a.id, a);
            if (!known.has(a.id)) newCount += 1;
          }
        }
        opts.onProgress?.({ page: chunks, loaded: byId.size, strategy: 'icu-api' });
        if (opts.knownIds && newCount === 0) break;
        if (opts.stopAfter && byId.size >= opts.stopAfter) break;
        if (start <= oldestMs) break;
        end = start - 86400000;
        if (delayMs && end > oldestMs) await sleep(delayMs);
      }
    }

    const activities = [...byId.values()];
    return { activities, chunks, stopped, error, domSeeded: domCount > 0 };
  }

  async function scanAll(opts = {}) {
    const fetchImpl = opts.fetchImpl || defaultFetch;
    const settings = opts.settings || DS.settingsStore?.get() || {};
    const delayMs = opts.delayMs ?? 150;
    const retryDelayMs = opts.retryDelayMs ?? 1800;
    const maxAttempts = Math.max(1, opts.maxAttempts ?? 4);

    let oldestMs;
    if (opts.searchDateStart) oldestMs = Date.parse(opts.searchDateStart);
    else if (settings.scanWindowDays > 0) oldestMs = Date.now() - settings.scanWindowDays * 86400000;
    else if (opts.knownIds) oldestMs = Date.now() - INCREMENTAL_MS;
    else oldestMs = Date.parse('1980-01-01');
    const newestMs = opts.searchDateEnd ? Date.parse(opts.searchDateEnd) + 86399999 : Date.now();

    const seen = new Set();
    if (opts.knownIds) for (const id of opts.knownIds) seen.add(String(id));

    let best = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      opts.onAttempt?.(attempt);
      const r = await attemptScan(opts, fetchImpl, settings, delayMs, seen, oldestMs, newestMs);
      best = r;
      if (r.activities.length || r.stopped || attempt === maxAttempts) break;
      if (attempt < maxAttempts && !opts.signal?.aborted) await sleep(retryDelayMs); // let the WS paint rows
    }

    if (best.activities.length) {
      console.info(
        `[dedupe] icu scan: ${best.activities.length} activities (${best.domSeeded ? 'dom' : ''}${best.chunks ? '+rest' : ''}${best.error ? `, rest error: ${best.error.message}` : ''})`
      );
      console.info('[dedupe] icu sample:', best.activities.slice(0, 4).map((a) => ({ id: a.id, type: a.type, d: Math.round(a.distanceM || 0), t: a.movingTimeS, s: a.startDateLocal })));
    }

    if (!best.activities.length && best.error) {
      throw best.error;
    }

    const domOnly = best.activities.length > 0 && best.chunks === 0;
    return {
      activities: best.activities,
      pages: best.chunks || domOnly ? 1 : 0,
      strategy: domOnly ? 'icu-dom' : best.chunks ? 'icu-api' : 'icu-dom',
      truncated: false,
      stopped: best.stopped,
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
      const res = await apiGet(fetchImpl, `/api/activity/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      return normalize(await res.json().catch(() => null));
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
    xsrfToken,
    extractRows,
    guessType,
    triggerToken
  };
})();
