(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const clean = (s) => String(s || '').trim();
  const stripSlash = (s) => clean(s).replace(/\/+$/, '');

  // Lightweight reachability check for each provider. Pass a fetchImpl for
  // tests; defaults to the global fetch. Returns { ok, message } — never throws.
  async function testConnection(opts = {}) {
    const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const mode = opts.mode || 'off';
    const llmUrl = opts.llmUrl;
    const llmBaseUrl = opts.llmBaseUrl;
    const llmApiKey = opts.llmApiKey;
    if (!fetchImpl) return { ok: false, message: 'No fetch available in this context.' };

    try {
      if (mode === 'ollama') {
        const url = stripSlash(llmUrl) || 'http://localhost:11434';
        const res = await fetchImpl(`${url}/api/tags`);
        if (!res.ok) return { ok: false, message: `Ollama HTTP ${res.status} from ${url}/api/tags` };
        const j = await res.json().catch(() => ({}));
        const models = (j.models || []).map((m) => m.name || m.model).filter(Boolean);
        return {
          ok: true,
          message: `Ollama reachable at ${url} — ${models.length} installed model${models.length === 1 ? '' : 's'}${models.length ? ' (' + models.slice(0, 3).join(', ') + ')' : ''}`
        };
      }

      if (mode === 'openai') {
        const baseUrl = stripSlash(llmBaseUrl) || 'https://api.openai.com/v1';
        const headers = { 'Content-Type': 'application/json' };
        if (clean(llmApiKey)) headers.Authorization = `Bearer ${clean(llmApiKey)}`;
        const res = await fetchImpl(`${baseUrl}/models`, { headers });
        if (!res.ok) {
          return { ok: false, message: `Endpoint HTTP ${res.status} from ${baseUrl}/models` };
        }
        const j = await res.json().catch(() => null);
        const models = (j && Array.isArray(j.data) ? j.data : []).map((m) => m.id || m.name).filter(Boolean).slice(0, 5);
        return {
          ok: true,
          message: `Endpoint reachable at ${baseUrl}${models.length ? ' — ' + models.join(', ') : ''}`
        };
      }

      if (mode === 'webgpu') {
        if (!(typeof navigator !== 'undefined' && navigator.gpu)) {
          return { ok: false, message: 'WebGPU is not available in this browser — use Chrome/Chromium with WebGPU enabled, or try Ollama / OpenAI instead.' };
        }
        return { ok: true, message: 'WebGPU available. The first run streams ~1-2 GB of model weights from HuggingFace.' };
      }

      return { ok: false, message: 'AI coach is Off — pick a provider first.' };
    } catch (e) {
      return { ok: false, message: String((e && e.message) || e) };
    }
  }

  DS.llm = { testConnection };
})();