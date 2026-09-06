(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  function getCsrfToken(doc = document) {
    return doc.querySelector('meta[name="csrf-token"]')?.content || null;
  }

  function deleteUrl(id) {
    return `https://www.strava.com/activities/${id}`;
  }

  async function deleteActivity(id, opts = {}) {
    const fetchImpl = opts.fetchImpl || ((...a) => fetch(...a));
    const csrf = opts.csrf ?? getCsrfToken();
    if (!csrf) return { id, ok: false, error: 'missing-csrf' };

    try {
      const res = await fetchImpl(deleteUrl(id), {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        referrer: deleteUrl(id),
        body: new URLSearchParams({ _method: 'delete', authenticity_token: csrf }).toString()
      });
      const ok = res.ok && typeof res.url === 'string' && res.url.includes('/athlete/training');
      return { id, ok, status: res.status };
    } catch (e) {
      return { id, ok: false, error: String(e) };
    }
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  async function logDeletion(entry) {
    try {
      const st = DS.ext?.storage?.local;
      if (!st) return;
      const stored = await st.get('dedupeLog');
      const log = stored?.dedupeLog || [];
      log.unshift({ at: Date.now(), ...entry });
      await st.set({ dedupeLog: log.slice(0, 500) });
    } catch (e) {
      DS.debug?.('deletion log failed', e);
    }
  }

  async function deleteMany(ids, opts = {}) {
    const { onProgress, delayMs = 2500, shouldAbort, ...rest } = opts;
    const results = [];
    for (let i = 0; i < ids.length; i++) {
      if (shouldAbort?.()) break;
      const r = await deleteActivity(ids[i], rest);
      results.push(r);
      if (r.ok) await logDeletion({ id: r.id });
      onProgress?.({ done: i + 1, total: ids.length, last: r });
      if (i < ids.length - 1 && delayMs) await sleep(delayMs);
    }
    return results;
  }

  DS.deleter = { getCsrfToken, deleteActivity, deleteMany, deleteUrl, logDeletion };
})();
