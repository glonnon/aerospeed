(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const DEFAULTS = {
    scanScope: '100',
    planId: '',
    planStart: '',
    units: 'metric',
    enrichPairs: true,
    llmMode: 'off',
    llmModel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    llmUrl: 'http://localhost:11434',
    llmBaseUrl: 'https://api.openai.com/v1',
    llmOpenaiModel: 'gpt-4o-mini',
    llmApiKey: '',
    timeWindowMinutes: 10,
    checkDstShift: true,
    typeMatching: 'same',
    distanceTolerancePct: 5,
    durationTolerancePct: 5,
    minOverlapPct: 80,
    polylineThreshold: 0.75,
    deepGpsCheck: false,
    deletionMode: 'links',
    gearService: {},
    goalDistanceKm: 0,
    goalElevM: 0,
    deviceRanking: [
      'garmin',
      'wahoo',
      'polar',
      'suunto',
      'coros',
      'hammerhead',
      'bryton',
      'stages',
      'stryd',
      'apple',
      'samsung',
      'strava',
      'fitbit'
    ]
  };

  const RANGES = {
    timeWindowMinutes: [1, 120],
    distanceTolerancePct: [1, 50],
    durationTolerancePct: [1, 50],
    minOverlapPct: [10, 100],
    polylineThreshold: [0.3, 1],
    goalDistanceKm: [0, 50000],
    goalElevM: [0, 500000]
  };

  const SCOPES = ['100', '90', '180', '365', 'all'];

  function sanitize(raw = {}) {
    const s = { ...DEFAULTS, deviceRanking: [...DEFAULTS.deviceRanking] };
    for (const [key, [lo, hi]] of Object.entries(RANGES)) {
      const v = Number(raw[key]);
      if (!Number.isFinite(v)) continue;
      s[key] = Math.min(hi, Math.max(lo, key === 'polylineThreshold' ? v : Math.round(v)));
    }
    if (raw.typeMatching === 'same' || raw.typeMatching === 'related') s.typeMatching = raw.typeMatching;
    if (raw.deletionMode === 'links' || raw.deletionMode === 'auto') s.deletionMode = raw.deletionMode;
    if (raw.scanScope !== undefined && SCOPES.includes(raw.scanScope)) s.scanScope = raw.scanScope;
    if (typeof raw.planId === 'string') s.planId = raw.planId;
    if (typeof raw.planStart === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.planStart)) s.planStart = raw.planStart;
    if (['off', 'webgpu', 'ollama', 'openai'].includes(raw.llmMode)) s.llmMode = raw.llmMode;
    if (raw.units === 'metric' || raw.units === 'imperial') s.units = raw.units;
    if (raw.enrichPairs !== undefined) s.enrichPairs = !!raw.enrichPairs;
    if (typeof raw.llmBaseUrl === 'string' && /^https?:\/\//.test(raw.llmBaseUrl)) s.llmBaseUrl = raw.llmBaseUrl;
    if (typeof raw.llmOpenaiModel === 'string' && raw.llmOpenaiModel.trim()) s.llmOpenaiModel = raw.llmOpenaiModel.trim();
    if (typeof raw.llmApiKey === 'string') s.llmApiKey = raw.llmApiKey.trim();
    if (typeof raw.llmModel === 'string' && raw.llmModel.trim()) s.llmModel = raw.llmModel.trim();
    if (typeof raw.llmUrl === 'string' && /^https?:\/\//.test(raw.llmUrl)) s.llmUrl = raw.llmUrl;
    if (raw.checkDstShift !== undefined) s.checkDstShift = !!raw.checkDstShift;
    if (raw.deepGpsCheck !== undefined) s.deepGpsCheck = !!raw.deepGpsCheck;
    if (Array.isArray(raw.deviceRanking)) {
      const seen = new Set();
      const list = raw.deviceRanking
        .map((x) => String(x).toLowerCase().trim())
        .filter((x) => x && !seen.has(x) && seen.add(x))
        .slice(0, 32);
      if (list.length) s.deviceRanking = list;
    }
    if (raw.gearService && typeof raw.gearService === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(raw.gearService)) {
        const everyKm = Number(v?.everyKm);
        const lastKm = Number(v?.lastKm);
        if (Number.isFinite(everyKm) && everyKm > 0) {
          out[k] = { everyKm, lastKm: Number.isFinite(lastKm) && lastKm >= 0 ? lastKm : 0 };
        }
      }
      s.gearService = out;
    }
    return s;
  }

  function area() {
    const st = DS.ext?.storage;
    if (!st) return null;
    return st.local?.get ? st.local : st.sync || null;
  }

  let cache = null;
  const listeners = new Set();

  async function load() {
    const a = area();
    try {
      const stored = a ? await a.get('settings') : null;
      cache = sanitize({ ...DEFAULTS, ...(stored?.settings || {}) });
    } catch (e) {
      DS.debug?.('settings load failed, using defaults', e);
      cache = sanitize(DEFAULTS);
    }
    return cache;
  }

  async function save(patch) {
    cache = sanitize({ ...(cache || DEFAULTS), ...patch });
    try {
      const a = area();
      if (a) await a.set({ settings: cache });
    } catch (e) {
      DS.debug?.('settings save failed', e);
    }
    for (const fn of listeners) {
      try {
        fn(cache);
      } catch (e) {
        DS.debug?.('settings listener error', e);
      }
    }
    return cache;
  }

  function get() {
    return cache || sanitize(DEFAULTS);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function defaults() {
    return sanitize(DEFAULTS);
  }

  DS.kv = {
    async get(key) {
      const a = area();
      if (!a) return null;
      try {
        const r = await a.get(key);
        return r?.[key] ?? null;
      } catch (e) {
        DS.debug?.('kv get failed', e);
        return null;
      }
    },
    async set(key, value) {
      const a = area();
      if (!a) return;
      try {
        await a.set({ [key]: value });
      } catch (e) {
        DS.debug?.('kv set failed', e);
      }
    }
  };

  DS.settingsStore = { sanitize, load, save, get, subscribe, defaults };
})();
