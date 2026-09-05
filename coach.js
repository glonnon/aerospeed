(() => {
  const logEl = document.getElementById('log');
  const fillEl = document.getElementById('fill');
  const controls = document.getElementById('controls');
  const outEl = document.getElementById('out');
  const runBtn = document.getElementById('run');
  const extraEl = document.getElementById('extra');

  const clean = (s) => (s || '').trim();
  const LOG = (line) => {
    logEl.textContent += '\n' + line;
    logEl.scrollTop = logEl.scrollHeight;
  };
  const setProgress = (p) => {
    if (fillEl) fillEl.style.width = `${Math.round(p * 100)}%`;
  };

  let enginePromise = null;

  const readStorage = (key) =>
    new Promise((resolve) => {
      chrome.storage.local.get([key], (r) => resolve(r[key] ?? null));
    });
  const writeStorage = (key, value) =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });

  const SYSTEM = `You are an expert endurance sports training coach. You write clear, structured training
plans and adapt them based on an athlete's real training data. Always respond ONLY with a single JSON
object — no markdown, no commentary around it.`;

  const GEN_SCHEMA = `Respond with JSON in exactly this shape:
{
  "name": "Plan title (max 60 chars)",
  "weeks": <integer 4..13>,
  "sport": "ride" | "run" | "any",
  "longKm": [..],    // one number per week: peak distance for the key discipline in km (0 if not applicable)
  "hoursMult": [..], // one number per week: total-hours multiplier vs the athlete's current weekly average (0.3..3)
  "intensity": [..], // one integer per week: number of hard/intensity sessions, 0-3
  "tips": ["week-by-week guidance, 1-3 sentences each"]
}`;

  const ADJ_SCHEMA = `The athlete has completed some weeks. Adjust the plan for the future based on adherence
(planned vs done: hours, long ride distance, intensity sessions). Respond with JSON in exactly this shape:
{
  "reasoning": "1-2 sentences on how the athlete is tracking",
  "longKm": [..],    // full array, one number per week of the plan (peak distance km per week)
  "hoursMult": [..], // full array of hours multipliers per week
  "intensity": [..], // full array of intensity-session counts per week
  "tips": ["updated guidance for the upcoming weeks"]
}`;

  function parseJson(text) {
    const t = String(text || '').replace(/```json|```/g, '').trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no JSON object in model output');
    return JSON.parse(t.slice(start, end + 1));
  }

  async function runJob() {
    const job = await readStorage('coachJob');
    if (!job) {
      LOG('No coaching job found. Launch this page from the extension Dashboard.');
      return;
    }
    const settings = await readStorage('settings');
    const mode = job.mode || (settings && settings.llmMode) || 'off';
    const context = job.context || '';

    try {
      if (mode === 'webgpu') {
        for (let attempt = 0; attempt < 2; attempt++) {
          const out = await runWebGpu(job, settings);
          const ok = (() => { try { parseJson(out); return true; } catch { return false; } })();
          if (ok || attempt === 1) {
            handleOut(job, out);
            break;
          }
          LOG("Output wasn't valid JSON — retrying with a formatting hint…");
          job.context = job.context + '\n\nPrevious (invalid) output:\n' + String(out).slice(0, 600) + '\nPlease respond with ONLY the JSON object, nothing else.';
        }
      } else if (mode === 'ollama') await runOllama(job);
      else if (mode === 'openai') await runOpenAI(job);
      else {
        LOG('AI coach is Off. Enable WebGPU or Ollama in Settings (Dashboard → Settings).');
        await writeStorage('llmResult', { nonce: job.nonce, ok: false, error: 'mode-off' });
      }
    } catch (e) {
      LOG('Error: ' + (e && e.message ? e.message : e));
      await writeStorage('llmResult', { nonce: job.nonce, ok: false, error: String((e && e.message) || e) });
    }
  }

  async function runWebGpu(job, settings) {
    const model = clean((settings && settings.llmModel)) || 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
    if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
    LOG(`[webgpu] Loading local WebLLM runtime…`);
    const webllm = await import('./src/vendor/webllm.js');
    LOG(`[webgpu] Using ${model} … weights stream from HuggingFace (first run ~1-2 GB).`);
    if (!enginePromise) {
      enginePromise = webllm
        .CreateMLCEngine(model, { useWorker: false, initProgressCallback: (p) => setProgress(p.progress) })
        .catch((err) => {
          enginePromise = null;
          throw err;
        });
    }
    const engine = await enginePromise;
    const messages = buildMessages(job, model);
    LOG('[webgpu] Generating…');
    const res = await engine.chat.completions.create({ messages, temperature: 0.2, max_tokens: 1400 });
    handleOut(job, res.choices[0].message.content);
  }

  async function runOllama(job) {
    const settings = await readStorage('settings');
    const url = clean((settings && settings.llmUrl)) || 'http://localhost:11434';
    const model = (job.model || 'qwen2.5:3b').trim();
    LOG(`[ollama] Asking ${url} (${model})…`);
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: buildMessages(job, model), stream: false, format: 'json' })
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const j = await res.json();
    handleOut(job, j.message.content);
  }

  async function runOpenAI(job) {
    const settings = await readStorage('settings');
    const baseUrl = clean((settings && settings.llmBaseUrl)) || 'https://api.openai.com/v1';
    const model = clean((settings && settings.llmOpenaiModel)) || 'gpt-4o-mini';
    const apiKey = clean(settings && settings.llmApiKey);
    if (!apiKey) throw new Error('OpenAI mode needs an API key (Dashboard → Settings → API key).');
    LOG(`[openai] Asking ${baseUrl.replace(/\/+$/, '')}/chat/completions (${model})…`);
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: buildMessages(job, model), temperature: 0.2, max_tokens: 1400 })
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const j = await res.json();
    handleOut(job, j.choices && j.choices[0] && j.choices[0].message.content);
  }

  function buildMessages(job, modelName) {
    const extra = clean(extraEl.value);
    const schema = job.task === 'adjust' ? ADJ_SCHEMA : GEN_SCHEMA;
    const user =
      job.task === 'adjust'
        ? `Planned program (JSON, one index per week):\n${job.planJson}\n\nWeek-by-week actuals (planned vs done):\n${job.context}\n\nAdjust the future weeks of this program.`
        : `Athlete training summary (recent weeks, newest first):\n${job.context}\n\nGoal: ${job.goal}\n${extra ? 'Extra context: ' + extra : ''}\nGenerate a training plan.`;
    return [
      { role: 'system', content: SYSTEM + '\n' + schema },
      { role: 'user', content: user }
    ];
  }

  function handleOut(job, raw) {
    let parsed;
    try {
      parsed = parseJson(raw);
    } catch (e) {
      LOG('Could not parse model output:\n' + raw);
      writeStorage('llmResult', { nonce: job.nonce, ok: false, error: 'unparsed-model-output' });
      return;
    }
    if (job.task === 'generate') {
      const plansNs = globalThis.DedupeStrava && globalThis.DedupeStrava.plans;
      const v = plansNs && plansNs.validateGeneratedPlan ? plansNs.validateGeneratedPlan(parsed) : { ok: false, errors: ['plans not loaded'] };
      if (!v.ok) {
        LOG('Plan invalid: ' + v.errors.join('; '));
        writeStorage('llmResult', { nonce: job.nonce, ok: false, error: 'invalid:' + v.errors.join('; ') });
        return;
      }
      writeStorage('llmResult', { nonce: job.nonce, ok: true, plan: v.plan, text: raw });
      LOG('✓ Plan generated and saved. Return to the Dashboard and click "Load AI plan".');
    } else {
      const plansNs = globalThis.DedupeStrava && globalThis.DedupeStrava.plans;
      const adjusted =
        plansNs && plansNs.applyAdjustments && job.planJson
          ? plansNs.applyAdjustments(JSON.parse(job.planJson), parsed)
          : null;
      writeStorage('llmResult', { nonce: job.nonce, ok: true, adjustments: parsed, plan: adjusted, text: raw });
      LOG('✓ Adjustments saved. Return to the Dashboard to apply. ' + (parsed.reasoning || ''));
    }
    if (outEl) outEl.textContent = JSON.stringify(parsed, null, 2);
  }

  runBtn.addEventListener('click', runJob);
  LOG('Waking up…');

  readStorage('coachJob').then(async (job) => {
    if (job) {
      LOG(`Job found: ${job.task === 'adjust' ? 'adjust plan' : 'generate plan'}${job.goal ? ' — ' + job.goal : ''}.`);
      controls.style.display = 'block';
      runBtn.disabled = false;
    } else {
      LOG('No job. Open from the extension Dashboard → “AI Coach”.');
    }
  });
})();