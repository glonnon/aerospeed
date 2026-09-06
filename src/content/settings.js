(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const FIELDS = [
    {
      key: 'units',
      label: 'Units',
      type: 'select',
      options: [
        ['metric', 'Metric (km, m)'],
        ['imperial', 'Imperial (mi, ft)']
      ]
    },
    {
      key: 'scanScope',
      label: 'Scan scope',
      type: 'select',
      options: [
        ['100', 'Recent 100 activities'],
        ['90', 'Last 3 months'],
        ['180', 'Last 6 months'],
        ['365', 'Last year'],
        ['all', 'Entire history (slow with many activities)']
      ]
    },
    { key: 'timeWindowMinutes', label: 'Time window (minutes)', type: 'number', min: 1, max: 120 },
    { key: 'checkDstShift', label: 'Check ±1h clock shifts (DST)', type: 'toggle' },
    {
      key: 'typeMatching',
      label: 'Activity type matching',
      type: 'select',
      options: [
        ['same', 'Same type only'],
        ['related', 'Allow related types (Zwift, treadmill…)']
      ]
    },
    { key: 'distanceTolerancePct', label: 'Distance tolerance (%)', type: 'number', min: 1, max: 50 },
    { key: 'durationTolerancePct', label: 'Duration tolerance (%)', type: 'number', min: 1, max: 50 },
    { key: 'minOverlapPct', label: 'Min time overlap (%)', type: 'number', min: 10, max: 100 },
    { key: 'polylineThreshold', label: 'Route similarity', type: 'range', min: 0.3, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'deepGpsCheck', label: 'Deep GPS stream check (slower)', type: 'toggle' },
    { key: 'enrichPairs', label: 'Fetch detail pages for suspected duplicates (PRs, device, HR)', type: 'toggle' },
    { key: 'goalDistanceKm', label: 'Year distance goal (km, 0 = off)', type: 'number', min: 0, max: 50000 },
    { key: 'goalElevM', label: 'Year climbing goal (m, 0 = off)', type: 'number', min: 0, max: 500000 },
    {
      key: 'deletionMode',
      label: 'Deletion mode',
      type: 'select',
      options: [
        ['links', 'Manual: generate delete links (safe)'],
        ['auto', 'Automatic: delete via my session']
      ]
    },
    {
      key: 'llmMode',
      label: 'AI coach (LLM provider)',
      type: 'select',
      options: [
        ['off', 'Off'],
        ['webgpu', 'WebGPU (in-browser, Chrome)'],
        ['ollama', 'Local Ollama / LM Studio'],
        ['openai', 'OpenAI-compatible API']
      ]
    },
    { key: 'llmModel', label: 'WebGPU model (MLC id)', type: 'text' },
    { key: 'llmUrl', label: 'Ollama endpoint', type: 'text' },
    { key: 'llmBaseUrl', label: 'OpenAI-compatible base URL', type: 'text' },
    { key: 'llmOpenaiModel', label: 'OpenAI-compatible model', type: 'text' },
    { key: 'llmApiKey', label: 'API key (stored locally only)', type: 'text' }
  ];

  function render(container, store) {
    const s = store.get();
    container.textContent = '';

    for (const f of FIELDS) {
      const id = `ds-set-${f.key}`;
      let control;
      if (f.type === 'toggle') {
        control = DS.h('input', {
          type: 'checkbox',
          id,
          checked: !!s[f.key],
          onchange: (e) => store.save({ [f.key]: e.target.checked })
        });
      } else if (f.type === 'select') {
        control = DS.h(
          'select',
          { id, onchange: (e) => store.save({ [f.key]: e.target.value }) },
          f.options.map(([v, l]) => DS.h('option', { value: v, selected: s[f.key] === v }, l))
        );
      } else if (f.type === 'range') {
        const label = DS.h('span', { class: 'ds-range-val' }, f.fmt(s[f.key]));
        control = DS.h('input', {
          type: 'range',
          id,
          min: f.min,
          max: f.max,
          step: f.step,
          value: s[f.key],
          oninput: (e) => (label.textContent = f.fmt(Number(e.target.value))),
          onchange: (e) => store.save({ [f.key]: Number(e.target.value) })
        });
        container.append(
          DS.h('div', { class: 'ds-field' }, DS.h('label', { for: id }, f.label), DS.h('div', { class: 'ds-ctl ds-ctl-range' }, control, label))
        );
        continue;
      } else if (f.type === 'text') {
        control = DS.h('input', {
          type: 'text',
          id,
          value: s[f.key],
          onchange: (e) => store.save({ [f.key]: e.target.value })
        });
        container.append(
          DS.h('div', { class: 'ds-field' }, DS.h('label', { for: id }, f.label), DS.h('div', { class: 'ds-ctl' }, control))
        );
        continue;
      } else {
        control = DS.h('input', {
          type: 'number',
          id,
          min: f.min,
          max: f.max,
          value: s[f.key],
          onchange: (e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) store.save({ [f.key]: v });
          }
        });
      }
      container.append(
        DS.h('div', { class: 'ds-field' }, DS.h('label', { for: id }, f.label), DS.h('div', { class: 'ds-ctl' }, control))
      );
    }

    container.append(DS.h('div', { class: 'ds-field' }, DS.h('label', null, 'Device trust (top = best)'), renderRanking(s, store)));
    container.append(renderLlmTest(s, store));
    container.append(
      DS.h(
        'div',
        { class: 'ds-warning', 'data-shows': 'auto' },
        '⚠ Automatic mode deletes activities from your account using your logged-in session. Deletions are permanent and cannot be undone by Strava support.'
      )
    );
    container.append(
      DS.h(
        'div',
        { class: 'ds-field ds-actions' },
        DS.h('button', { class: 'ds-btn ds-btn-ghost', type: 'button', onclick: async () => { await store.save(store.defaults()); render(container, store); } }, 'Reset to defaults')
      )
    );
    updateWarning(container, s);
    return container;
  }

  function updateWarning(container, settings) {
    const w = container.querySelector('.ds-warning');
    if (w) w.classList.toggle('ds-visible', settings.deletionMode === 'auto');
  }

  // "Test connection" for the selected AI provider. Runs the check from the
  // extension's own context so it can reach the endpoint; requests host
  // permission for a custom OpenAI-compatible base URL when needed.
  function renderLlmTest(s, store) {
    const status = DS.h('span', { class: 'ds-hint' });
    const btn = DS.h(
      'button',
      {
        class: 'ds-btn ds-btn-ghost ds-btn-xs',
        type: 'button',
        title: `Test the current AI provider: ${s.llmMode}`,
        onclick: async () => {
          btn.disabled = true;
          status.textContent = 'Testing…';
          let mode = s.llmMode;
          try {
            if (mode === 'openai') {
              const base = (s.llmBaseUrl || '').trim();
              if (base && typeof chrome !== 'undefined' && chrome.permissions) {
                let origin;
                try {
                  origin = new URL(base).origin;
                } catch (e) {
                  /* not a URL — fall through, the fetch will fail clearly */
                }
                if (origin) {
                  const granted = await chrome.permissions.request({ permissions: ['tabs', 'scripting'], origins: [origin + '/*'] });
                  if (!granted) {
                    status.textContent = 'Permission for the endpoint host was not granted — test may still fail.';
                  }
                }
              }
            }
            const r = await DS.llm.testConnection({ mode, llmUrl: s.llmUrl, llmBaseUrl: s.llmBaseUrl, llmApiKey: s.llmApiKey });
            status.textContent = (r.ok ? '✓ ' : '✗ ') + r.message;
          } catch (e) {
            status.textContent = '✗ ' + String((e && e.message) || e);
          } finally {
            btn.disabled = false;
          }
        }
      },
      `Test ${s.llmMode === 'off' ? 'AI' : s.llmMode} connection`
    );
    return DS.h(
      'div',
      { class: 'ds-field' },
      DS.h('label', null, 'AI connection test'),
      DS.h('div', { class: 'ds-ctl-row' }, btn, status)
    );
  }

  function renderRanking(s, store) {
    const list = DS.h('div', { class: 'ds-rank' });
    const redraw = () => {
      list.textContent = '';
      s.deviceRanking.forEach((brand, i) => {
        list.append(
          DS.h(
            'div',
            { class: 'ds-rank-row' },
            DS.h('span', { class: 'ds-rank-label' }, brand),
            DS.h(
              'span',
              { class: 'ds-rank-btns' },
              DS.h('button', {
                type: 'button',
                class: 'ds-btn ds-btn-xs',
                disabled: i === 0 ? '' : null,
                onclick: () => move(i, -1)
              }, '↑'),
              DS.h('button', {
                type: 'button',
                class: 'ds-btn ds-btn-xs',
                disabled: i === s.deviceRanking.length - 1 ? '' : null,
                onclick: () => move(i, 1)
              }, '↓')
            )
          )
        );
      });
    };
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= s.deviceRanking.length) return;
      const next = [...s.deviceRanking];
      [next[i], next[j]] = [next[j], next[i]];
      s.deviceRanking = next;
      store.save({ deviceRanking: next });
      redraw();
    };
    redraw();
    return list;
  }

  DS.settingsUI = {
    render(container, store = DS.settingsStore) {
      if (!container.dataset.subscribed) {
        container.dataset.subscribed = '1';
        store.subscribe((s) => updateWarning(container, s));
      }
      return render(container, store);
    }
  };
})();
