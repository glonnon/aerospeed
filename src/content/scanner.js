(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  function defaultFetch(url, opts) {
    return fetch(url, opts);
  }

  function buildPageUrl(origin, page, perPage, dateStart, dateEnd) {
    const url = new URL('/athlete/training_activities', origin);
    url.search = new URLSearchParams({
      new_page: 'true',
      keywords: '',
      activity_type: '',
      workout_type: '',
      commute: '',
      private_activities: '',
      trainer: '',
      search_type: '',
      search_date_start: dateStart || '',
      search_date_end: dateEnd || '',
      order_by: 'date',
      page: String(page),
      per_page: String(perPage)
    }).toString();
    return url.toString();
  }


  async function fetchPage(fetchImpl, page, perPage, opts) {
    const origin = opts.origin || (typeof location !== 'undefined' ? location.origin : 'https://www.strava.com');
    const url = buildPageUrl(origin, page, perPage, opts.searchDateStart, opts.searchDateEnd);
    let attempt = 0;
    for (;;) {
      const res = await fetchImpl(url, {
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'text/html, */*; q=0.01'
        }
      });
      if (!res.ok && (res.status === 429 || res.status >= 500) && attempt === 0) {
        attempt += 1;
        await sleep(opts.retryDelayMs ?? 2000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} while fetching activity page ${page}`);
      return {
        html: await res.text(),
        url: res.url ? String(res.url) : '',
        status: res.status,
        contentType: res.headers?.get?.('content-type') || ''
      };
    }
  }

  function parseEmbeddedProps(doc) {
    const out = [];
    for (const el of doc.querySelectorAll('[data-react-class][data-react-props]')) {
      if (!/ActivityRow|Activity/i.test(el.dataset.reactClass || '')) continue;
      try {
        out.push(normalizeProps(JSON.parse(el.dataset.reactProps)));
      } catch (e) {
        DS.debug?.('bad react props', e);
      }
    }
    return out.filter(Boolean);
  }

  function normalizeProps(j) {
    if (!j || j.id == null) return null;
    return {
      id: String(j.id),
      name: j.name ?? null,
      type: j.type || j.activity_type || j.sport_type || null,
      startDateLocal: j.start_date_local || j.start_date || null,
      distanceM: num(j.distance),
      movingTimeS: num(j.moving_time),
      elapsedTimeS: num(j.elapsed_time),
      elevationM: num(j.total_elevation_gain ?? j.elevation_gain),
      deviceName: j.device_name || j.device || null,
      commute: j.commute ?? null,
      gearId: j.gear_id ?? j.bike_id ?? j.athlete_gear_id ?? null,
      trainer: j.trainer ?? null,
      isPrivate: j.private ?? null,
      hasHr: j.has_heartrate ?? !!j.average_heartrate,
      hasPower: j.device_watts ?? (j.average_watts != null),
      hasCadence: j.average_cadence != null,
      manual: j.manual ?? false,
      kudosCount: num(j.kudos_count) || 0,
      commentCount: num(j.comment_count) || 0,
      photoCount: num(j.total_photo_count ?? j.photo_count) || 0,
      prCount: num(j.pr_count) || 0,
      achievementCount: num(j.achievement_count) || 0,
      polyline: j.map?.summary_polyline || j.map?.polyline || null,
      source: 'props'
    };
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';
  const HEADER_RE = new RegExp(`^\\s*(${MONTHS})\\s+\\d{4}\\s*$`, 'i');
  const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
  const DIST_RE = /\d([.,]\d+)?\s*(km|mi)\b/i;
  const ELEV_RE = /^\d[\d.,]*\s*m\b/i;
  const LINK_RE = /\/activities\/(\d+)/;

  function cellText(el) {
    return (el?.textContent || '').trim();
  }

  function parseTimeToSec(s) {
    const parts = s.split(':').map((p) => parseInt(p, 10));
    if (parts.some((p) => !Number.isFinite(p))) return null;
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }

  function parseDistanceToM(s) {
    const n = num(String(s).replace(/[^\d.,]/g, '').replace(/,/g, ''));
    if (n == null) return null;
    return /mi\b/i.test(s) ? n * 1609.344 : n * 1000;
  }

  function parseElevToM(s) {
    const n = num(String(s).replace(/[^\d.,]/g, '').replace(/,/g, ''));
    if (n == null) return null;
    return /ft\b/i.test(s) ? n * 0.3048 : n;
  }

  function parseDateText(s, ctxDate) {
    const t = s.trim();
    if (!t || /^\d{1,2}:\d{2}/.test(t)) return null;
    if (/\d{4}/.test(t)) {
      const p = Date.parse(t);
      if (Number.isFinite(p)) return new Date(p).toISOString();
      return null;
    }
    if (ctxDate) {
      const m = t.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
      if (m) {
        const p = Date.parse(`${m[1]} ${m[2]}, ${ctxDate.getFullYear()}`);
        if (Number.isFinite(p)) return new Date(p).toISOString();
      }
    }
    const p2 = Date.parse(t);
    return Number.isFinite(p2) ? new Date(p2).toISOString() : null;
  }

  function parseDomRows(doc) {
    const out = [];
    let ctxDate = null;
    for (const node of doc.querySelectorAll('h2, h3, .date-section-header, tr, .training-activity-row')) {
      if (!node.matches('tr, .training-activity-row')) {
        const t = cellText(node);
        if (HEADER_RE.test(t)) {
          const d = new Date(Date.parse(t));
          if (Number.isFinite(d.getTime())) ctxDate = d;
        }
        continue;
      }
      if (!node.querySelector('a[href*="/activities/"]')) continue;
      const act = parseRow(node, ctxDate);
      if (act) out.push(act);
    }
    return out;
  }

  function parseRow(row, ctxDate) {
    const link = row.querySelector('a[href*="/activities/"]');
    const idMatch = link?.getAttribute('href')?.match(LINK_RE);
    if (!idMatch) return null;

    const cells = [...row.querySelectorAll(':scope > td, :scope > th')].map(cellText);
    const source = cells.length ? cells : [cellText(row)];

    let distanceM = null;
    let movingTimeS = null;
    let elevationM = null;
    let startDateLocal = null;

    const timeEl = row.querySelector('time[datetime]');
    if (timeEl) {
      const d = new Date(timeEl.getAttribute('datetime'));
      if (Number.isFinite(d.getTime())) startDateLocal = d.toISOString();
    }

    for (const c of source) {
      if (!c) continue;
      if (movingTimeS == null && TIME_RE.test(c)) movingTimeS = parseTimeToSec(c);
      if (distanceM == null && DIST_RE.test(c)) distanceM = parseDistanceToM(c);
      if (elevationM == null && ELEV_RE.test(c)) elevationM = parseElevToM(c);
    }

    if (!startDateLocal) {
      for (const c of source) {
        const iso = parseDateText(c, ctxDate);
        if (iso) {
          startDateLocal = iso;
          break;
        }
      }
    }

    const iconUse = row.querySelector('use[*|href], use');
    const iconHref = iconUse?.getAttribute('href') || iconUse?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
    const typeMatch = iconHref.match(/icon-([a-z]+)/i);

    return {
      id: idMatch[1],
      name: cellText(link) || null,
      type: typeMatch ? typeMatch[1].replace(/([a-z])([A-Z])/g, '$1 $2') : null,
      startDateLocal,
      distanceM,
      movingTimeS,
      elapsedTimeS: null,
      elevationM,
      deviceName: null,
      commute: null,
      trainer: null,
      isPrivate: null,
      hasHr: false,
      hasPower: false,
      hasCadence: false,
      manual: false,
      kudosCount: 0,
      commentCount: 0,
      photoCount: 0,
      prCount: 0,
      achievementCount: 0,
      polyline: null,
      source: 'row'
    };
  }

  function parseIso(s) {
    if (!s) return null;
    const norm = String(s).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const d = new Date(norm);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  function parseJsonModels(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return [];
    }
    const models = Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
    const out = [];
    for (const m of models) {
      if (m == null || m.id == null) continue;
      out.push({
        ...blankRow(String(m.id)),
        name: m.name ?? null,
        type: m.sport_type || m.activity_type_display_name || m.display_type || null,
        startDateLocal: parseIso(m.start_time) || parseIso(m.start_date_local) || null,
        distanceM: num(m.distance_raw),
        movingTimeS: num(m.moving_time_raw),
        elapsedTimeS: num(m.elapsed_time_raw),
        elevationM: num(m.elevation_gain_raw),
        commute: m.commute ?? null,
        gearId: m.athlete_gear_id ?? m.bike_id ?? null,
        trainer: m.trainer ?? null,
        isPrivate: m.private ?? null,
        hasHr: !!m.has_heartrate,
        hasGps: !!m.has_latlng,
        source: 'json'
      });
    }
    return out;
  }

  function parseFragment(html, parser) {
    const trimmed = String(html || '').trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const models = parseJsonModels(trimmed);
      if (models.length) return models;
    }
    const P = parser || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!P) return [];
    const doc = new P().parseFromString(html, 'text/html');
    const props = parseEmbeddedProps(doc);
    if (props.length) return props;
    const rows = parseDomRows(doc);
    if (rows.length) return rows;
    return parseGenericLinks(doc);
  }

  function blankRow(id) {
    return {
      id,
      name: null,
      type: null,
      startDateLocal: null,
      distanceM: null,
      movingTimeS: null,
      elapsedTimeS: null,
      elevationM: null,
      deviceName: null,
      commute: null,
      trainer: null,
      isPrivate: null,
      hasHr: false,
      hasPower: false,
      hasCadence: false,
      manual: false,
      kudosCount: 0,
      commentCount: 0,
      photoCount: 0,
      prCount: 0,
      achievementCount: 0,
      polyline: null,
      source: 'generic'
    };
  }

  function scanTextMetrics(text, ctxDate) {
    const out = {};
    for (const tok of text.split(/[\s|·•]+/)) {
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(tok)) {
        out.movingTimeS = parseTimeToSec(tok);
        break;
      }
    }
    const distMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(km|mi)\b/i);
    if (distMatch) out.distanceM = parseDistanceToM(`${distMatch[1]} ${distMatch[2]}`);
    const elevMatch = text.match(/(\d[\d.,]*)\s*(m|ft)\b/);
    if (elevMatch && !/\//.test(elevMatch[0])) out.elevationM = parseElevToM(`${elevMatch[1]} ${elevMatch[2]}`);
    const iso = text.match(/\d{4}-\d{2}-\d{2}(T[\d:]+Z?)?/);
    if (iso) {
      const d = new Date(iso[0]);
      if (Number.isFinite(d.getTime())) out.startDateLocal = d.toISOString();
    }
    if (!out.startDateLocal) {
      const dm = text.match(new RegExp(`(${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}`, 'i'));
      if (dm) {
        const d = new Date(Date.parse(dm[0]));
        if (Number.isFinite(d.getTime())) out.startDateLocal = d.toISOString();
      }
    }
    if (!out.startDateLocal && ctxDate) {
      const dm = text.match(new RegExp(`(${MONTHS})\\s+(\\d{1,2})\\b`, 'i'));
      if (dm) {
        const d = Date.parse(`${dm[1]} ${dm[2]}, ${ctxDate.getFullYear()}`);
        if (Number.isFinite(d)) out.startDateLocal = new Date(d).toISOString();
      }
    }
    return out;
  }

  function parseGenericLinks(doc) {
    const out = [];
    const seen = new Set();
    let ctxDate = null;
    for (const link of doc.querySelectorAll('a[href*="/activities/"]')) {
      const m = (link.getAttribute('href') || '').match(LINK_RE);
      if (!m || seen.has(m[1])) continue;
      const container =
        link.closest('tr, .training-activity-row') || link.closest('li, article') || link.parentElement;
      if (!container) continue;
      const timeEl = container.querySelector('time[datetime]');
      const act = blankRow(m[1]);
      if (timeEl) {
        const d = new Date(timeEl.getAttribute('datetime'));
        if (Number.isFinite(d.getTime())) act.startDateLocal = d.toISOString();
      }
      const metrics = scanTextMetrics(cellText(container) || cellText(link), ctxDate);
      out.push({
        ...act,
        name: cellText(link) || null,
        ...metrics
      });
      seen.add(m[1]);
    }
    return out;
  }

  function redact(s) {
    return String(s)
      .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[REDACTED_JWT]')
      .replace(/((?:access_token|auth.?token|bearer)"?\s*[:=]\s*"?)[^"&\s,}]{8,}/gi, '$1[REDACTED]');
  }

  function diagnose(html, meta = {}) {
    return {
      finalUrl: meta.url || '',
      status: meta.status || 0,
      contentType: meta.contentType || '',
      length: html ? html.length : 0,
      counts: {
        activityLinks: (html.match(/\/activities\/\d+/g) || []).length,
        tableRows: (html.match(/<tr[\s>]/gi) || []).length,
        reactProps: (html.match(/data-react-props/g) || []).length,
        reactActivityClasses: (html.match(/data-react-class="[^"]*Activit[^"]*"/gi) || []).length,
        loginMarkers: (html.match(/log[- ]?in|sign in with/gi) || []).length
      },
      sample: redact(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').slice(0, 1500))
    };
  }

  function findWebToken(doc) {
    if (!doc) return null;
    const html = doc.documentElement ? doc.documentElement.outerHTML : String(doc);
    const m =
      html.match(/"access_token"\s*:\s*"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/) ||
      html.match(/Bearer\s+(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function normalizeApi(j) {
    if (!j || j.id == null) return null;
    return normalizeProps({
      id: j.id,
      name: j.name,
      type: j.type || j.sport_type,
      start_date_local: j.start_date_local || j.start_date,
      distance: j.distance,
      moving_time: j.moving_time,
      elapsed_time: j.elapsed_time,
      total_elevation_gain: j.total_elevation_gain,
      device_name: j.device_name,
      commute: j.commute,
      trainer: j.trainer,
      private: j.private,
      has_heartrate: j.has_heartrate ?? !!j.average_heartrate,
      device_watts: j.device_watts ?? j.average_watts != null,
      average_cadence: j.average_cadence,
      manual: j.manual,
      kudos_count: j.kudos_count,
      comment_count: j.comment_count,
      photo_count: j.total_photo_count,
      pr_count: j.pr_count,
      achievement_count: j.achievement_count,
      map: j.map
    });
  }

  async function fetchApiPage(fetchImpl, token, page, perPage, opts) {
    const origin = opts.origin || (typeof location !== 'undefined' ? location.origin : 'https://www.strava.com');
    const url = `${origin}/api/v3/athlete/activities?per_page=${perPage}&page=${page}`;
    const res = await fetchImpl(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from web API page ${page}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(normalizeApi).filter(Boolean);
  }

  async function scanViaApi(fetchImpl, token, opts) {
    const perPage = 100;
    const maxPages = opts.maxPages || 40;
    const activities = [];
    const seen = new Set();
    let page = 0;
    while (page < maxPages) {
      page += 1;
      const rows = await fetchApiPage(fetchImpl, token, page, perPage, opts);
      let added = 0;
      for (const a of rows) {
        if (!a?.id || seen.has(a.id)) continue;
        seen.add(a.id);
        activities.push(a);
        added += 1;
      }
      opts.onProgress?.({ page, loaded: activities.length, strategy: 'web-api' });
      if (added === 0) break;
      if (opts.delayMs) await sleep(opts.delayMs);
    }
    return { activities, pages: page, strategy: 'web-api', truncated: page >= maxPages };
  }

  async function scanAll(opts = {}) {
    const fetchImpl = opts.fetchImpl || defaultFetch;
    const perPage = opts.perPage || 100;
    const maxPages = opts.maxPages || 400;
    const delayMs = opts.delayMs ?? 150;
    const settings = opts.settings || DS.settingsStore?.get() || {};
    const doc = opts.doc || (typeof document !== 'undefined' ? document : null);

    let searchDateStart = opts.searchDateStart || '';
    if (!searchDateStart && settings.scanWindowDays > 0) {
      const d = new Date(Date.now() - settings.scanWindowDays * 86400000);
      searchDateStart = d.toISOString().slice(0, 10);
    }

    const token = opts.token ?? findWebToken(doc);
    if (token) {
      try {
        const apiRes = await scanViaApi(fetchImpl, token, { ...opts, maxPages: 40 });
        if (apiRes.activities.length) {
          return { ...apiRes, hasWebToken: true };
        }
      } catch (e) {
        DS.debug?.('web api scan failed', e);
      }
    }

    const activities = [];
    const seen = new Set();
    if (opts.knownIds) for (const id of opts.knownIds) seen.add(String(id));
    const cutoffMs = opts.searchDateStart ? Date.parse(opts.searchDateStart) : null;
    const endMs = opts.searchDateEnd ? Date.parse(opts.searchDateEnd) : null;
    let page = 0;
    let truncated = false;
    let stopped = false;
    let firstMeta = null;

    while (page < maxPages) {
      if (opts.signal?.aborted) {
        stopped = true;
        break;
      }
      page += 1;
      const pageRes = await fetchPage(fetchImpl, page, perPage, { ...opts, searchDateStart });
      if (!firstMeta) firstMeta = pageRes;
      const rows = parseFragment(pageRes.html, opts.parser);
      let added = 0;
      for (const a of rows) {
        if (!a?.id || seen.has(a.id)) continue;
        if (a.startDateLocal) {
          const t = Date.parse(a.startDateLocal);
          if (Number.isFinite(t)) {
            if (cutoffMs != null && t < cutoffMs) continue;
            if (endMs != null && t > endMs) continue;
          }
        }
        seen.add(a.id);
        activities.push(a);
        added += 1;
      }
      opts.onProgress?.({ page, loaded: activities.length, strategy: 'ajax' });
      if (cutoffMs != null) {
        const dated = rows
          .map((r) => (r?.startDateLocal ? Date.parse(r.startDateLocal) : NaN))
          .filter((t) => Number.isFinite(t));
        if (dated.length && Math.min(...dated) < cutoffMs) break;
      }
      if (added === 0) break;
      if (opts.stopAfter && activities.length >= opts.stopAfter) break;
      if (opts.signal?.aborted) {
        stopped = true;
        break;
      }
      if (delayMs) await sleep(delayMs);
    }
    truncated = page >= maxPages;

    let strategy = 'ajax';

    if (!activities.length && !stopped && doc) {
      const domRows = parseDomRows(doc);
      if (domRows.length) {
        for (const a of domRows) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            activities.push(a);
          }
        }
        strategy = 'dom';
      }
    }

    const result = {
      activities,
      pages: strategy === 'dom' ? 1 : page,
      truncated,
      stopped,
      strategy,
      hasWebToken: !!token
    };
    if (firstMeta) {
      result.htmlDiagnostics = diagnose(firstMeta.html, firstMeta);
    }
    return result;
  }

  async function fetchActivityMeta(id, fetchImpl = defaultFetch) {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://www.strava.com';
    let html;
    try {
      const res = await fetchImpl(`${origin}/activities/${id}`, { credentials: 'same-origin' });
      if (!res.ok) return null;
      html = await res.text();
    } catch (e) {
      DS.debug?.('activity meta fetch failed', e);
      return null;
    }
    let date = null;
    const m =
      html.match(/"start_date_local"\s*:\s*"([^"]+)"/) ||
      html.match(/"startDate"\s*:\s*"([^"]+)"/) ||
      html.match(/<time[^>]+datetime="([^"]+)"/i);
    if (m) {
      const d = parseIso(m[1]);
      if (d) date = d;
    }
    let name = null;
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      name = (doc.title || '').replace(/\s*[|–—-]\s*Strava.*$/i, '').trim() || null;
    }
    return normalizeProps({ id, name, start_date_local: date });
  }

  const DETAIL_GUARD = 120; // stop scanning match() calls if page structure shifts
  const NUM = (s) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  async function fetchActivityDetail(id, fetchImpl = defaultFetch) {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://www.strava.com';
    let html;
    try {
      const res = await fetchImpl(`${origin}/activities/${id}`, { credentials: 'same-origin' });
      if (!res.ok) return null;
      html = await res.text();
    } catch (e) {
      DS.debug?.('activity detail fetch failed', e);
      return null;
    }
    const grab = (re) => {
      const m = html.match(re);
      if (!m) return 0;
      const v = NUM(m[1]);
      return v == null ? 0 : v;
    };
    const s = /"summary_polyline"\s*:\s*"([^"]+)"/.exec(html);
    const dName = /"device_name"\s*:\s*"([^"]+)"/.exec(html);
    const hart = html.match(/"has_heartrate"\s*:\s*(true|false)/);
    const hwatt = html.match(/"device_watts"\s*:\s*(true|false)/);
    const hrAvg = /"average_heartrate"\s*:\s*([\d.]+)/.exec(html);
    const wattsAvg = /"(average_watts|weighted_average_watts)"\s*:\s*([\d.]+)/.exec(html);
    const cadAvg = /"average_cadence"\s*:\s*([\d.]+)/.exec(html);
    const dat = {
      prCount: grab(/"pr_count"\s*:\s*(\d+)/),
      achievementCount: grab(/"achievement_count"\s*:\s*(\d+)/),
      kudosCount: grab(/"kudos_count"\s*:\s*(\d+)/),
      commentCount: grab(/"comment_count"\s*:\s*(\d+)/),
      photoCount: grab(/"total_photo_count"\s*:\s*(\d+)/),
      totalElevationGain: grab(/"total_elevation_gain"\s*:\s*([\d.]+)/),
      distanceM: grab(/"distance"\s*:\s*([\d.]+)/),
      movingTimeS: grab(/"moving_time"\s*:\s*(\d+)/),
      deviceName: dName ? dName[1].replace(/\\"/g, '"') : null,
      hasHr: hart ? hart[1] === 'true' : !!hrAvg,
      hasPower: hwatt ? hwatt[1] === 'true' : !!wattsAvg,
      hasCadence: !!cadAvg,
      polyline: s ? s[1] : null
    };
    return dat;
  }

  DS.scanner = {
    scanAll,
    parseFragment,
    parseDomRows,
    parseEmbeddedProps,
    parseRow,
    normalizeProps,
    normalizeApi,
    buildPageUrl,
    parseTimeToSec,
    parseDistanceToM,
    parseElevToM,
    findWebToken,
    diagnose,
    redact,
    parseGenericLinks,
    scanTextMetrics,
    parseJsonModels,
    parseIso,
    fetchActivityMeta,
    fetchActivityDetail
  };
})();
