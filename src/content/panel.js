(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const state = {
    open: false,
    scanning: false,
    deleting: false,
    activities: [],
    groups: [],
    stale: false,
    confirmArm: false,
    abort: null,
    tab: null,
    badgeObserver: null,
    rangeAbort: null,
    volWeeks: 0,
    dashDayKey: null
  };

  const fmtDist = (m, dec) => DS.units.dist(m, DS.settingsStore.get().units, dec == null ? 1 : dec);
  const fmtElev = (m) => DS.units.elev(m, DS.settingsStore.get().units);
  const fmtKm = (km, dec) => DS.units.kmTo(km, DS.settingsStore.get().units, dec == null ? 1 : dec);
  const actUrl = (a) => DS.site.activityUrl(a.id);
  const api = () =>
    DS.site.id === 'intervals'
      ? DS.icu
      : { scanAll: DS.scanner.scanAll, deleteMany: DS.deleter.deleteMany, fetchActivityMeta: DS.scanner.fetchActivityMeta };
  const fmtTime = (s) => {
    if (s == null) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  };

  let els = {};

  function mount(host) {
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = DS.PANEL_CSS;
    shadow.append(style);

    els = {};
    els.panel = DS.h('div', { class: 'ds-panel', hidden: '' });
    els.fab = DS.h('button', {
      class: 'ds-fab',
      type: 'button',
      title: 'AeroSpeed',
      onclick: () => toggle(true)
    }, '⧉⧉');

    els.status = DS.h('p', { class: 'ds-status' }, 'Idle. Scan your activities to look for duplicates.');
    els.scanBtn = DS.h('button', { class: 'ds-btn', type: 'button', onclick: runScan }, 'Scan for duplicates');
    els.dashBtn = DS.h('button', { class: 'ds-btn ds-btn-ghost', type: 'button', onclick: openDashboard }, 'Dashboard');
    els.summary = DS.h('div', { class: 'ds-summary', hidden: '' });
    els.results = DS.h('div', { class: 'ds-results' }, DS.h('div', { class: 'ds-placeholder' }, 'No scan yet.'));
    els.stale = DS.h('div', { class: 'ds-stale', hidden: '' }, 'Settings changed — re-scan for accurate results.');

    const drawerBody = DS.h('div', { class: 'ds-drawer-body' });
    DS.settingsUI.render(drawerBody);
    DS.settingsStore.load().then(() => DS.settingsUI.render(drawerBody));
    els.drawer = DS.h(
      'details',
      { class: 'ds-drawer' },
      DS.h('summary', { class: 'ds-drawer-head' }, 'Settings'),
      drawerBody
    );

    const fromInput = DS.h('input', { type: 'date' });
    const toInput = DS.h('input', { type: 'date' });
    const rangeBtn = DS.h('button', {
      class: 'ds-btn ds-btn-xs',
      type: 'button',
      onclick: () => searchByRange(fromInput.value, toInput.value)
    }, 'Search range');
    const idInput = DS.h('input', { type: 'text', placeholder: 'e.g. 19995316027', style: 'flex:1;min-width:120px' });
    const idBtn = DS.h('button', {
      class: 'ds-btn ds-btn-xs',
      type: 'button',
      onclick: () => searchById(idInput.value)
    }, 'Look up #');
    const searchBody = DS.h(
      'div',
      { class: 'ds-drawer-body' },
      DS.h('div', { class: 'ds-hint' }, 'Search all activities by time range:'),
      DS.h('div', { class: 'ds-plan-picker' }, fromInput, toInput, rangeBtn),
      DS.h('div', { class: 'ds-hint' }, 'Or by activity number (the digits in its URL):'),
      DS.h('div', { class: 'ds-plan-picker' }, idInput, idBtn)
    );
    els.search = DS.h(
      'details',
      { class: 'ds-drawer' },
      DS.h('summary', { class: 'ds-drawer-head' }, 'Find historical duplicates'),
      searchBody
    );

    const expCsv = DS.h('button', {
      class: 'ds-btn ds-btn-xs',
      type: 'button',
      onclick: async () => {
        exportMode = 'csv';
        await exportData();
      }
    }, 'Export CSV');
    const expJson = DS.h('button', {
      class: 'ds-btn ds-btn-ghost ds-btn-xs',
      type: 'button',
      onclick: async () => {
        exportMode = 'json';
        await exportData();
      }
    }, 'Export JSON');
    els.exportDrawer = DS.h(
      'details',
      { class: 'ds-drawer' },
      DS.h('summary', { class: 'ds-drawer-head' }, 'Backup / export'),
      DS.h(
        'div',
        { class: 'ds-drawer-body' },
        DS.h('div', { class: 'ds-hint' }, 'Back up your activity index before deleting. The deletion log is exported alongside.'),
        DS.h('div', { class: 'ds-plan-picker' }, expCsv, expJson)
      )
    );

    els.panel.append(
      DS.h(
        'div',
        { class: 'ds-hdr' },
        DS.h('strong', null, 'AeroSpeed'),
        DS.h('span', { class: 'ds-ver' }, DS.VERSION),
        DS.h('button', { class: 'ds-iconbtn', type: 'button', title: 'Settings', onclick: openSettingsDrawer }, '⚙'),
        DS.h('button', { class: 'ds-iconbtn', type: 'button', title: 'Close', onclick: () => toggle(false) }, '✕')
      ),
      DS.h(
        'div',
        { class: 'ds-body' },
        els.status,
        DS.h('div', { class: 'ds-actions-row' }, els.scanBtn, els.dashBtn),
        els.summary,
        els.results,
        els.stale,
        els.search,
        els.exportDrawer,
        els.drawer
      ),
      DS.h('div', { class: 'ds-footer' }, 'Runs locally. Deletions are permanent — review every pair before confirming.')
    );

    shadow.append(els.fab, els.panel);
    DS.settingsStore.subscribe(() => {
      if (state.activities.length) {
        state.stale = true;
        els.stale.hidden = false;
      }
    });
  }

  function toggle(open) {
    state.open = open;
    els.panel.hidden = !open;
    els.fab.hidden = open;
  }

  function openSettingsDrawer() {
    if (!els.drawer) return;
    els.drawer.open = !els.drawer.open;
  }

  function downloadFile(name, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function buildShareCard() {
    const stats = DS.viz.shareStats(state.activities, { filter: state.dashFilter || 'all' });
    const W = 900;
    const H = 420;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#101418');
    grad.addColorStop(1, '#24292f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '800 44px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(`AeroSpeed ${new Date().getFullYear()}`, 48, 78);
    ctx.font = '400 20px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#ff8a65';
    ctx.fillText('Year in review', 48, 112);
    const cells = [
      ['Activities', stats.count],
      ['Distance', `${fmtDist(stats.distKm * 1000, 0)}`],
      ['Time', `${stats.timeH} h`],
      ['Climbing', fmtElev(stats.elevM)],
      ['Best streak', `${stats.bestStreak} days`]
    ];
    const cx = W - 48 - 440;
    const colW = 176;
    const rowH = 52;
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 2]
    ].forEach(([cc, rr], i) => {
      const x = cx + cc * (colW + 22);
      const y = 170 + rr * (rowH + 18);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(x, y, colW, rowH, 10);
      ctx.fill();
      ctx.fillStyle = '#ff8a65';
      ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(String(cells[i][0]).toUpperCase(), x + 14, y + 18);
      ctx.fillStyle = '#fff';
      ctx.font = '700 26px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(String(cells[i][1]), x + 14, y + 43);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '15px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(`All-time: ${stats.totalCount} activities · ${fmtDist(stats.totalDistKm * 1000, 0)}`, 48, H - 36);
    return c;
  }

  function downloadShareCard() {
    try {
      const c = buildShareCard();
      c.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aerospeed-year-${new Date().getFullYear()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }, 'image/png');
      els.status.textContent = 'Share card downloaded.';
    } catch (e) {
      console.error('[dedupe] share card failed', e);
      els.status.textContent = `Share card failed: ${e.message}`;
    }
  }

  function exportActivitiesCSV(acts) {
    const cols = ['id', 'name', 'type', 'start_date_local', 'distance_m', 'moving_time_s', 'elevation_m', 'device', 'pr_count', 'achievement_count', 'kudos_count', 'source'];
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [cols.join(',')];
    for (const a of acts) {
      rows.push(cols.map((c) => esc(a[c] ?? (c === 'device' ? a.deviceName : ''))).join(','));
    }
    return rows.join('\n');
  }

  async function exportData() {
    const settings = DS.settingsStore.get();
    const units = settings.units || 'metric';
    const acts = state.activities;
    if (!acts.length) {
      els.status.textContent = 'Nothing to export yet — scan first.';
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (exportMode === 'csv') {
      downloadFile(`aerospeed-activities-${stamp}.csv`, exportActivitiesCSV(acts), 'text/csv');
    } else {
      downloadFile(
        `aerospeed-activities-${stamp}.json`,
        JSON.stringify({ exportedAt: new Date().toISOString(), units, count: acts.length, activities: acts }, null, 2),
        'application/json'
      );
    }
    let logText = '';
    const log = await DS.kv.get('dedupeLog');
    if (log && log.length) logText = JSON.stringify(log, null, 2);
    else logText = '';
    if (logText) downloadFile(`aerospeed-deletions-${stamp}.json`, logText, 'application/json');
    els.status.textContent = `Exported ${acts.length} activities${logText ? ' + deletion log' : ''}.`;
  }

  let exportMode = 'csv';

  function oldestLoadedMs() {
    let min = null;
    for (const a of state.activities) {
      const t = new Date(a.startDateLocal).getTime();
      if (Number.isFinite(t) && (min == null || t < min)) min = t;
    }
    return min;
  }

  function loadedSpanDays() {
    const oldest = oldestLoadedMs();
    if (oldest == null) return 0;
    return Math.max(1, Math.ceil((Date.now() - oldest) / 86400000));
  }

  function mergeActivities(incoming) {
    const seen = new Set(state.activities.map((a) => a.id));
    for (const a of incoming || []) {
      if (!a?.id) continue;
      if (seen.has(a.id)) {
        // Replace the stale cached row (e.g. a sparse DOM row) with the fuller
        // REST one when the new copy carries metrics the old one lacks.
        const i = state.activities.findIndex((x) => x.id === a.id);
        if (i >= 0 && a.distanceM != null && state.activities[i].distanceM == null) state.activities[i] = a;
        continue;
      }
      seen.add(a.id);
      state.activities.push(a);
    }
    state.groups = DS.dedupe.findGroups(state.activities, DS.settingsStore.get());
    return state.activities;
  }

  async function setVolRange(weeks) {
    state.volWeeks = weeks;
    const label = weeks === 13 ? '3 months' : weeks === 52 ? '1 year' : '6 months';
    const cutoffMs = Date.now() - weeks * 7 * 86400000;
    const oldest = oldestLoadedMs();
    const needFetch = !state.activities.length || oldest == null || oldest > cutoffMs;
    if (needFetch) {
      const cutoffIso = new Date(cutoffMs).toISOString().slice(0, 10);
      const note = state.dash?.querySelector('.ds-dash-note');
      const abort = { aborted: false };
      state.rangeAbort = abort;
      try {
        const res = await api().scanAll({
          settings: DS.settingsStore.get(),
          signal: abort,
          searchDateStart: cutoffIso,
          maxPages: Math.ceil((weeks * 7) / 20) + 10,
          delayMs: 150,
          onProgress: ({ page, loaded }) => {
            if (note) note.textContent = `Loading ${label} of history… ${loaded} activities (${page} pages)`;
            els.status.textContent = `Loading ${label} history… ${loaded} loaded`;
          }
        });
        mergeActivities(res.activities);
        await persistCache();
      } catch (e) {
        console.error('[dedupe] range fetch failed', e);
        if (note) note.textContent = `History fetch failed: ${e.message}`;
        return;
      }
    }
    if (els.status) els.status.textContent = `Showing ${label} (${state.activities.length} activities loaded).`;
    renderDashboard();
  }

  async function runScan() {
    if (state.scanning) {
      state.scanAbort.aborted = true;
      els.scanBtn.disabled = true;
      els.scanBtn.textContent = 'Stopping…';
      return;
    }
    state.scanning = true;
    state.stale = false;
    state.scanAbort = { aborted: false };
    els.stale.hidden = true;
    els.results.textContent = '';
    els.summary.hidden = true;
    els.scanBtn.textContent = 'Stop scan';
    els.status.textContent = 'Loading settings…';
    try {
      const settings = await DS.settingsStore.load();
      const scope = settings.scanScope || '100';
      const SCOPE_LABEL = { 100: 'recent 100', 90: 'last 3 months', 180: 'last 6 months', 365: 'last year', all: 'entire history' };
      let maxPages = 400;
      let stopAfter = 0;
      let searchDateStart = '';
      if (scope === '100') {
        maxPages = 5;
        stopAfter = 100;
      } else if (scope !== 'all') {
        const days = Number(scope);
        searchDateStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
        maxPages = Math.ceil(days / 20) + 10;
      }
      els.status.textContent = `Scanning (${SCOPE_LABEL[scope] || scope})…`;
      const started = Date.now();
      const res = await api().scanAll({
        settings,
        signal: state.scanAbort,
        maxPages,
        stopAfter,
        searchDateStart,
        onProgress: ({ page, loaded }) => {
          const secs = Math.round((Date.now() - started) / 1000);
          els.status.textContent = `Scanning… ${loaded} activities loaded (${page} pages, ${secs}s)`;
        }
      });
      state.activities = mergeActivities(res.activities);
      console.info('[dedupe] scan result', {
        strategy: res.strategy,
        count: res.activities.length,
        pages: res.pages,
        truncated: res.truncated,
        hasWebToken: res.hasWebToken,
        htmlDiagnostics: res.htmlDiagnostics
      });
      if (!res.activities.length) {
        els.status.textContent =
          DS.site.id === 'intervals'
            ? 'Scan finished: 0 activities. Intervals.icu feeds its list over a live WebSocket — if this persists, reload the page or open the athlete Activities tab.'
            : 'Scan finished: 0 activities loaded. Are you logged in to Strava on this tab?';
        if (res.htmlDiagnostics) showDiagnostics(res.htmlDiagnostics, res.hasWebToken);
        console.info('[dedupe] scan finished with 0 activities', res);
        return;
      }
      const groups = DS.dedupe.findGroups(res.activities, settings);
      state.groups = groups;
      const dupes = groups.reduce((n, g) => n + g.remove.length, 0);
      console.info(`[dedupe] scan: ${res.activities.length} activities via ${res.strategy}, ${groups.length} duplicate groups`);
      const partial = res.stopped ? ' — PARTIAL (stopped early)' : res.truncated ? ' — truncated (page limit)' : '';
      const secs = Math.round((Date.now() - started) / 1000);
      els.status.textContent = `Scanned ${res.activities.length} activities via ${res.strategy} (${res.pages} pages, ${secs}s)${partial}.`;
      const knownIds = new Set(state.activities.map((a) => a.id));
      for (const a of res.activities) {
        if (!knownIds.has(a.id)) {
          knownIds.add(a.id);
          state.activities.push(a);
        }
      }
      state.groups = DS.dedupe.findGroups(state.activities, settings);
      await persistCache();
      if (!groups.length) {
        els.results.textContent = '';
        els.results.append(DS.h('div', { class: 'ds-placeholder' }, 'No duplicates found. 🎉'));
      } else {
        renderGroups();
      }
      els.summary.hidden = !groups.length;
      els.summary.textContent = `${groups.length} duplicate group${groups.length === 1 ? '' : 's'} · ${dupes} deletable ${dupes === 1 ? 'copy' : 'copies'}`;
      openDashboard();
      await enrichState();
      afterDataChanged();
    } catch (e) {
      console.error('[dedupe] scan failed', e);
      els.status.textContent = `Scan failed: ${e.message}`;
    } finally {
      state.scanning = false;
      els.scanBtn.disabled = false;
      els.scanBtn.textContent = 'Scan for duplicates';
    }
  }

  function showDiagnostics(diag, hasWebToken) {
    const text = JSON.stringify({ ...diag, hasWebToken }, null, 2);
    console.debug('[dedupe] scan diagnostics', text);
    const ta = DS.h('textarea', { class: 'ds-links', rows: 8, readonly: '' });
    ta.value = text;
    const copy = DS.h('button', {
      class: 'ds-btn ds-btn-ghost',
      type: 'button',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = 'Copied!';
        } catch {
          copy.textContent = 'Use the box →';
        }
        setTimeout(() => (copy.textContent = 'Copy diagnostics'), 1500);
      }
    }, 'Copy diagnostics');
    els.results.textContent = '';
    els.results.append(
      DS.h(
        'div',
        { class: 'ds-group' },
        DS.h('div', { class: 'ds-hint' }, 'Scan could not read any activities. Diagnostics below (tokens redacted) — paste them to the developer.'),
        DS.h('div', { class: 'ds-group-actions' }, copy),
        ta
      )
    );
  }

  function prWarningFor(g, auto) {
    const vulnerable = g.remove.filter((a) => (a.prCount || 0) > 0 || (a.achievementCount || 0) > 0);
    const keptPr = g.keep.prCount || 0;
    if (!vulnerable.length) return null;
    const warn = vulnerable.map((a) => `#${a.id} (${(a.prCount || 0)} PRs, ${(a.achievementCount || 0)} achievements)`).join(', ');
    const note = `⚠ Deleting loses ${warn} — keep the one with ${keptPr} PR to preserve them.`;
    return DS.h(
      'span',
      { class: auto ? 'ds-uncertain' : 'ds-hint', style: 'flex:1;min-width:120px' },
      note
    );
  }

  function renderGroups() {
    const settings = DS.settingsStore.get();
    const auto = settings.deletionMode === 'auto';
    els.results.textContent = '';

    for (const g of state.groups) {
      const checkboxes = [];
      const headCells = [DS.h('th', null, ''), DS.h('th', null, 'Keep')];
      for (const a of g.remove) {
        const cb = DS.h('input', { type: 'checkbox', checked: true, 'data-id': a.id, title: `delete #${a.id}` });
        checkboxes.push(cb);
        headCells.push(DS.h('th', { class: 'ds-delcol' }, 'Delete', cb));
      }

      const metricRow = (label, cell) =>
        DS.h('tr', null, DS.h('td', { class: 'ds-rowlabel' }, label), cell(g.keep, 'keep'), ...g.remove.map((a) => cell(a, 'remove')));

      const card = DS.h(
        'div',
        { class: 'ds-group' },
        DS.h(
          'table',
          { class: 'ds-table' },
          DS.h('thead', null, DS.h('tr', null, ...headCells)),
          DS.h(
            'tbody',
            null,
            metricRow('Activity', (a) =>
              DS.h('td', null, DS.h('a', { href: actUrl(a), target: '_blank', rel: 'noreferrer' }, a.name || `#${a.id}`))
            ),
            metricRow('Start', (a) => DS.h('td', null, fmtDate(a.startDateLocal))),
            metricRow('Distance', (a) => DS.h('td', null, fmtDist(a.distanceM))),
            metricRow('Moving time', (a) => DS.h('td', null, fmtTime(a.movingTimeS))),
            metricRow('Elevation', (a) => DS.h('td', null, fmtElev(a.elevationM))),
            metricRow('Device', (a) => DS.h('td', null, a.deviceName || '—')),
            metricRow('Quality', (a) => {
              const s = g.scores.find((x) => x.act === a);
              return DS.h('td', null, DS.h('span', { class: `ds-score ${s.score.total + s.relBonus >= 0 ? 'pos' : 'neg'}` }, String(s.score.total + s.relBonus)));
            })
          )
        ),
        DS.h(
          'div',
          { class: 'ds-group-actions' },
          g.uncertain ? DS.h('span', { class: 'ds-uncertain' }, 'Metrics close — double-check the keeper') : DS.h('span', { class: 'ds-hint' }, 'Recommended: keep highest score'),
          prWarningFor(g, auto),
          auto
            ? DS.h('button', { class: 'ds-btn ds-btn-danger', type: 'button', onclick: (e) => runGroupDelete(g, checkboxes, e.target) }, 'Delete checked')
            : null
        )
      );
      els.results.append(card);
    }

    els.results.append(renderBottomBar(auto));
    els.results.onchange = updateBulkCount;
    updateBulkCount();
  }

  function selectedIds() {
    return [...els.results.querySelectorAll('input[type="checkbox"][data-id]:checked')].map((cb) => cb.dataset.id);
  }

  function updateBulkCount() {
    const btn = els.results.querySelector('[data-role="bulk-delete"]');
    if (btn && !state.deleting) {
      const n = selectedIds().length;
      btn.textContent = `Delete all checked (${n})`;
      btn.disabled = n === 0;
    }
  }

  function renderModeSwitch() {
    const settings = DS.settingsStore.get();
    return DS.h(
      'div',
      { class: 'ds-mode' },
      DS.h('span', { class: 'ds-hint' }, 'Mode:'),
      DS.h('button', {
        class: `ds-btn ds-btn-xs ${settings.deletionMode === 'links' ? 'ds-btn-ghost-active' : 'ds-btn-ghost'}`,
        type: 'button',
        onclick: () => DS.settingsStore.save({ deletionMode: 'links' }).then(renderGroups)
      }, 'Links only'),
      DS.h('button', {
        class: `ds-btn ds-btn-xs ${settings.deletionMode === 'auto' ? 'ds-btn-danger' : 'ds-btn-ghost'}`,
        type: 'button',
        title: 'Lets the extension delete via your session',
        onclick: () => DS.settingsStore.save({ deletionMode: 'auto' }).then(renderGroups)
      }, 'Auto-delete')
    );
  }

  function renderBottomBar(auto) {
    const links = state.groups.flatMap((g) => g.remove.map((a) => actUrl(a)));
    const bar = DS.h('div', { class: 'ds-bottom' });
    bar.append(renderModeSwitch());
    if (auto) {
      const delAll = DS.h('button', {
        class: 'ds-btn ds-btn-danger',
        type: 'button',
        'data-role': 'bulk-delete',
        onclick: () => runBulkDelete(delAll)
      }, 'Delete all checked (0)');
      bar.append(delAll);
      bar.append(DS.h('div', { class: 'ds-hint' }, 'Mass delete: unchecks stay safe. While deleting, click the button again to stop.'));
    } else {
      const ta = DS.h('textarea', { class: 'ds-links', rows: Math.min(8, Math.max(3, links.length)), readonly: '' });
      ta.value = links.join('\n');
      const copy = DS.h('button', {
        class: 'ds-btn ds-btn-ghost',
        type: 'button',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(links.join('\n'));
            copy.textContent = 'Copied!';
          } catch {
            copy.textContent = 'Use the box →';
          }
          setTimeout(() => (copy.textContent = 'Copy all links'), 1500);
        }
      }, 'Copy all links');
      bar.append(copy, ta);
      bar.append(
        DS.h('div', { class: 'ds-hint' }, 'Links mode: open each link and delete manually — or switch to Auto-delete above for one-click bulk removal.')
      );
    }
    return bar;
  }

  function armConfirm(btn, ids) {
    if (state.deleting) {
      state.delAbort.aborted = true;
      return false;
    }
    if (!ids.length) return false;
    if (!state.confirmArm) {
      state.confirmArm = true;
      btn.dataset.origLabel = btn.textContent;
      btn.textContent = `Really delete ${ids.length}? Click again`;
      setTimeout(() => {
        state.confirmArm = false;
        if (btn.isConnected) btn.textContent = btn.dataset.origLabel || 'Delete checked';
      }, 4000);
      return false;
    }
    state.confirmArm = false;
    return true;
  }

  function runGroupDelete(group, checkboxes, btn) {
    const ids = checkboxes.filter((cb) => cb.checked).map((cb) => cb.dataset.id);
    if (armConfirm(btn, ids)) deleteIds(ids, btn);
  }

  function runBulkDelete(btn) {
    const ids = selectedIds();
    if (armConfirm(btn, ids)) deleteIds(ids, btn);
  }

  async function deleteIds(ids, btn) {
    state.deleting = true;
    const abort = { aborted: false };
    state.delAbort = abort;
    els.scanBtn.disabled = true;
    const results = await api().deleteMany(ids, {
      shouldAbort: () => abort.aborted,
      onProgress: ({ done, total, last }) => {
        btn.textContent = `Deleting ${done}/${total}… ${last.ok ? '✓' : '✗'} (click to stop)`;
        els.status.textContent = `Deleting ${done}/${total}… ${last.ok ? '✓' : '✗'} #${last.id}`;
      }
    });
    const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    state.activities = state.activities.filter((a) => !okIds.has(a.id));
    state.groups = DS.dedupe.findGroups(state.activities, DS.settingsStore.get());
    await persistCache();
    const failed = results.length - okIds.size;
    els.status.textContent = `Deleted ${okIds.size}${failed ? `, ${failed} failed` : ''}${abort.aborted ? ' (stopped early)' : ''}.`;
    state.deleting = false;
    els.scanBtn.disabled = false;
    renderGroups();
  }

  function findMountPoint() {
    let anchor = null;
    for (const sel of ['main', '#main', '[role="main"]', '#container-view', '#container']) {
      const el = document.querySelector(sel);
      if (el) {
        anchor = el;
        break;
      }
    }
    if (!anchor) return { parent: document.body, before: document.body.firstChild };
    let before = anchor.firstElementChild;
    while (before && before.matches('nav, header, [class*="nav" i], [class*="header" i]')) {
      before = before.nextElementSibling;
    }
    return { parent: anchor, before };
  }

  function attachDashShadow(host) {
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = DS.PANEL_CSS;
    shadow.append(style);
    return shadow;
  }

  function buildDashRoot() {
    return DS.h(
      'div',
      { class: 'ds-dash' },
      DS.h(
        'div',
        { class: 'ds-dash-card' },
        DS.h(
          'div',
          { class: 'ds-dash-hdr' },
          DS.h('strong', null, 'Training Goals & Summary'),
          DS.h('span', { class: 'ds-hint ds-dash-note' }, `${state.activities.length} activities loaded`),
          DS.h('button', { class: 'ds-iconbtn ds-iconbtn-dark', type: 'button', title: 'Hide', onclick: showActivitiesTab }, '✕')
        ),
        DS.h('div', { class: 'ds-chips' }, renderChips()),
        DS.h('div', { class: 'ds-dash-body' })
      )
    );
  }

  function createDashHostFor(strip) {
    const host = document.createElement('div');
    host.id = 'ds-dedupe-dashboard';
    const { parent, before } = findMountPointFor(strip);
    parent.insertBefore(host, before);
    const shadow = attachDashShadow(host);
    state.dash = buildDashRoot();
    shadow.append(state.dash);
  }

  function openDashboard() {
    if (state.dash && !state.dash.isConnected) state.dash = null;
    if (state.dash) {
      state.dash.style.display = 'block';
      state.dash.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!state.activities.length) {
      els.status.textContent = 'Scan first — the dashboard visualizes the activities you have loaded.';
      return;
    }
    state.dashFilter = 'all';
    if (state.tab) createDashHostFor(state.tab.strip);
    else {
      const host = document.createElement('div');
      host.id = 'ds-dedupe-dashboard';
      const { parent, before } = findMountPoint();
      parent.insertBefore(host, before);
      const shadow = attachDashShadow(host);
      state.dash = buildDashRoot();
      shadow.append(state.dash);
    }
    renderDashboard();
    state.dash.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeDashboard() {
    state.dash?.remove();
    state.dash = null;
  }

  function renderChips() {
    const chips = [
      ['all', 'All'],
      ['ride', 'Rides'],
      ['run', 'Runs / Walks'],
      ['other', 'Other']
    ];
    return chips.map(([v, label]) =>
      DS.h('button', {
        class: `ds-chip ${state.dashFilter === v ? 'ds-chip-on' : ''}`,
        type: 'button',
        onclick: () => {
          state.dashFilter = v;
          const chipsEl = state.dash.querySelector('.ds-chips');
          chipsEl.textContent = '';
          chipsEl.append(...renderChips());
          renderDashboard();
        }
      }, label)
    );
  }

  function dashCard(label, value, delta) {
    const arrow = delta == null ? '' : delta >= 0 ? '▲' : '▼';
    const cls = delta == null ? '' : delta >= 0 ? 'up' : 'down';
    return DS.h(
      'div',
      { class: 'ds-stat' },
      DS.h('div', { class: 'ds-stat-val' }, value),
      DS.h('div', { class: 'ds-stat-label' }, label),
      delta == null ? null : DS.h('div', { class: `ds-stat-delta ${cls}` }, `${arrow} ${Math.abs(Math.round(delta))}% vs prev 30d`)
    );
  }

  function svgFromMarkup(markup) {
    const t = document.createElement('template');
    t.innerHTML = String(markup).trim();
    const node = t.content.firstElementChild;
    if (!node || node.nodeName.toLowerCase() !== 'svg') {
      throw new Error('invalid svg markup');
    }
    return node;
  }

  function attachFitHover(wrap, svg, pts) {
    const G = DS.fitness.CHART;
    const overlay = svg.querySelector('.ds-fit-overlay');
    const cursor = svg.querySelector('.ds-fit-cursor');
    if (!overlay || !cursor || !pts.length) return;
    const iw = G.W - G.pad.l - G.pad.r;
    const r1 = (v) => Math.round(v * 10) / 10;
    const tip = DS.h('div', { class: 'ds-fit-tip', hidden: '' });
    wrap.append(tip);
    overlay.addEventListener('mousemove', (e) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const xV = ((e.clientX - rect.left) / rect.width) * G.W;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((xV - G.pad.l) / iw) * (pts.length - 1))));
      const p = pts[i];
      const cx = G.pad.l + (i * iw) / Math.max(1, pts.length - 1);
      cursor.setAttribute('x1', cx.toFixed(1));
      cursor.setAttribute('x2', cx.toFixed(1));
      cursor.setAttribute('visibility', 'visible');
      tip.textContent = '';
      tip.append(
        DS.h('div', { class: 'ds-fit-tip-date' }, p.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })),
        DS.h('div', null, `CTL ${r1(p.ctl)} · ATL ${r1(p.atl)} · TSB ${r1(p.tsb)}`)
      );
      const wrapRect = wrap.getBoundingClientRect();
      const xPx = (cx / G.W) * rect.width + (rect.left - wrapRect.left);
      tip.style.left = `${Math.max(0, Math.min(xPx + 12, wrapRect.width - 160))}px`;
      tip.style.top = '34px';
      tip.hidden = false;
    });
    overlay.addEventListener('mouseleave', () => {
      tip.hidden = true;
      cursor.setAttribute('visibility', 'hidden');
    });
  }

  function mondayOf(d = new Date()) {
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return dt;
  }

  const fmtDay = (d) => new Date(d).toLocaleString([], { month: 'short', day: 'numeric' });
  const STATUS_LABEL = { done: 'Done', partial: 'Partial', missed: 'Missed', future: 'Upcoming', idle: '—' };

  function dayDetailPanel(key, acts) {
    const sorted = [...acts].sort((x, y) => (y.distanceM || 0) - (x.distanceM || 0));
    const dateLabel = (() => {
      const d = new Date(key + 'T00:00:00');
      return Number.isFinite(d.getTime())
        ? d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric' })
        : key;
    })();
    const openAll = DS.h('button', {
      class: 'ds-btn ds-btn-xs',
      type: 'button',
      onclick: () => {
        for (const a of sorted) window.open(a.url, '_blank');
      }
    }, `Open all (${sorted.length})`);
    const close = DS.h('button', {
      class: 'ds-btn ds-btn-ghost ds-btn-xs',
      type: 'button',
      onclick: () => {
        state.dashDayKey = null;
        renderDashboard();
      }
    }, 'Close');
    const rows = sorted.map((a) =>
      DS.h(
        'div',
        { class: 'ds-top-row' },
        DS.h('a', { href: a.url, target: '_blank', rel: 'noreferrer' }, a.name || `#${a.id}`),
        DS.h('span', null, `${fmtDist(a.distanceM)} · ${fmtTime(a.movingTimeS)}`)
      )
    );
    return DS.h(
      'div',
      { class: 'ds-day' },
      DS.h(
        'div',
        { class: 'ds-group-actions' },
        DS.h('h3', null, `${dateLabel} — ${sorted.length} activit${sorted.length === 1 ? 'y' : 'ies'}`),
        DS.h('div', { class: 'ds-mode' }, openAll, close)
      ),
      ...rows
    );
  }

  function customPlans() {
    return (llmCustomPlansCache || []).map((p) => ({ ...p, llm: true }));
  }

  function resolvePlanById(id) {
    if (id === 'llm') return llmPlanFor();
    if (typeof id === 'string' && id.startsWith('custom:')) {
      const c = (llmCustomPlansCache || []).find((p) => p.id === id);
      return c ? { ...c, llm: true } : null;
    }
    return DS.plans.PLANS.find((p) => p.id === id) || null;
  }

  async function buildCustomPlan() {
    const name = prompt('Plan name:', 'Custom block');
    if (!name || !name.trim()) return;
    const weeks = parseInt(prompt('Weeks (4-13):', '8'), 10);
    if (!Number.isInteger(weeks) || weeks < 4 || weeks > 13) {
      els.status.textContent = 'Custom plan needs 4-13 weeks.';
      return;
    }
    const sport = prompt('Key sport (ride / run / any):', 'any') || 'any';
    const longStart = parseFloat((prompt('Week-1 long session distance (km, 0 = none):', '30') || '0'));
    const longEnd = parseFloat((prompt('Final-week long session distance (km):', '80') || '30'));
    const hoursBase = parseFloat((prompt('Hours per week (target):', '6') || '6')) || 6;
    const intensity = parseInt((prompt('Hard sessions per week (0-3):', '1') || '1'), 10);
    const raw = {
      name: name.trim(),
      weeks,
      sport: ['ride', 'run', 'any'].includes(sport.trim()) ? sport.trim() : 'any',
      longKm: Array.from({ length: weeks }, (_, i) => (longStart + Math.round(((longEnd - longStart) * i) / (weeks - 1 || 1)))),
      hoursMult: Array.from({ length: weeks }, () => 1),
      intensity: Array.from({ length: weeks }, () => Math.min(3, Math.max(0, intensity))),
      tips: ['Custom plan — tune the details as you go.']
    };
    const v = DS.plans.validateGeneratedPlan(raw);
    if (!v.ok) {
      els.status.textContent = 'Custom plan invalid: ' + v.errors.join('; ');
      return;
    }
    const plan = { ...v.plan, id: `custom:${Date.now()}`, scaleHours: hoursBase };
    llmCustomPlansCache = [...(llmCustomPlansCache || []), plan];
    await DS.kv.set(CUSTOM_PLANS_KEY, llmCustomPlansCache);
    await DS.settingsStore.save({ planId: plan.id, planStart: mondayOf().toISOString().slice(0, 10) });
    renderDashboard();
  }

  function planSection() {
    const settings = DS.settingsStore.get();
    const wrap = DS.h('div', { class: 'ds-chart ds-plan' });
    const plan = resolvePlanById(settings.planId);
    const aiReady = settings.llmMode !== 'off';

    const aiBtnIn = (goalInput) =>
      DS.h('button', {
        class: 'ds-btn ds-btn-ghost',
        type: 'button',
        disabled: aiReady ? null : '',
        title: aiReady ? '' : 'Enable WebGPU or Ollama in Settings',
        onclick: () => {
          if (!goalInput.value.trim()) {
            els.status.textContent = 'Describe a goal for the AI to plan toward.';
            return;
          }
          openCoachTab({ task: 'generate', goal: goalInput.value.trim(), context: aiContextText(), mode: settings.llmMode });
        }
      }, 'Generate with AI');
    const aiModeRow = () => {
      const chip = (m, label) =>
        DS.h('button', {
          class: `ds-chip ${settings.llmMode === m ? 'ds-chip-on' : ''}`,
          type: 'button',
          title:
            m === 'webgpu'
              ? 'Runs a small model in your browser via WebGPU (Chrome, needs a GPU)'
              : m === 'ollama'
                ? 'Uses a local Ollama / LM Studio server'
                : m === 'openai'
                  ? 'Any OpenAI-compatible API (set base URL, model, key in Settings)'
                  : 'Turn the AI coach off',
          onclick: async () => {
            await DS.settingsStore.save({ llmMode: m });
            renderDashboard();
          }
        }, label);
      return DS.h(
        'div',
        { class: 'ds-ai-card' },
        DS.h(
          'div',
          { class: 'ds-mode ds-ai-mode' },
          DS.h('strong', null, 'AI Coach'),
          chip('off', 'Off'),
          chip('webgpu', 'WebGPU'),
          chip('ollama', 'Ollama'),
          chip('openai', 'OpenAI API'),
          DS.h('button', {
            class: 'ds-btn ds-btn-ghost ds-btn-xs',
            type: 'button',
            onclick: openSettingsDrawer
          }, '⚙ Settings')
        )
      );
    };
    const aiInputRow = () => {
      const goal = DS.h('input', { type: 'text', placeholder: 'e.g. finish 100-mile ride in 12 weeks', style: 'flex:1;min-width:140px' });
      return DS.h('div', { class: 'ds-plan-picker' }, goal, aiBtnIn(goal));
    };

    if (!plan || !settings.planStart) {
      const customPlanBtn = DS.h('button', {
      class: 'ds-btn ds-btn-ghost',
      type: 'button',
      title: 'Build a simple custom plan without the AI',
      onclick: buildCustomPlan
    }, 'Build custom plan');
    const picker = DS.h('select', null,
      DS.h('option', { value: '' }, 'Choose a goal…'),
      ...[...DS.plans.PLANS, ...customPlans()].map((p) => DS.h('option', { value: p.id }, p.name))
    );
    const planSel = picker;
    const sel = planSel;
      const date = DS.h('input', { type: 'date', value: mondayOf().toISOString().slice(0, 10) });
      const start = DS.h('button', {
        class: 'ds-btn',
        type: 'button',
        onclick: async () => {
          if (!sel.value) return;
          await DS.settingsStore.save({ planId: sel.value, planStart: date.value || mondayOf().toISOString().slice(0, 10) });
          renderDashboard();
        }
      }, 'Start plan');
      wrap.append(
        DS.h('h3', null, 'Training plan'),
        DS.h('div', { class: 'ds-hint' }, 'Pick a goal and the week you started, or generate a custom plan with the local AI coach.'),
        aiModeRow(),
        DS.h('div', { class: 'ds-plan-picker' }, sel, date, start, customPlanBtn),
        aiReady
          ? aiInputRow()
          : DS.h('div', { class: 'ds-plan-picker' }, DS.h('input', { type: 'text', placeholder: 'Generate with AI — enable WebGPU/Ollama in Settings', disabled: '', style: 'flex:1;min-width:140px' }), DS.h('button', { class: 'ds-btn', disabled: '', type: 'button' }, 'Generate with AI'))
      );
      return wrap;
    }

    const a = DS.plans.assess(plan, settings.planStart, state.activities, Date.now());
    if (plan && plan.scaleHours) {
      for (const w of a.weeks) w.targetHours = Math.round((plan.scaleHours * (plan.hoursMult[w.index] || 1)) * 10) / 10;
    }
    const cur = a.current;
    const nw = a.nextWorkout;
    const llmPlan = plan && plan.llm ? plan : null;
    const aiEvalBtn = llmPlan && aiReady
      ? DS.h('button', {
          class: 'ds-btn ds-btn-ghost ds-btn-xs',
          type: 'button',
          onclick: () => {
            const rows = a.weeks
              .filter((w) => w.status !== 'future')
              .map((w) => `Week ${w.index + 1} (${w.status}): planned long ${w.planned.longKm || '-'} km / done ${Math.round(w.actual.longKm)} km; planned hours ${w.targetHours ?? '?'} / done ${w.actual.hours.toFixed(1)}; intensity ${w.planned.intensity || 0}/${w.actual.intensity}`);
            openCoachTab({
              task: 'adjust',
              mode: settings.llmMode,
              evalWeek: completedPastWeeks(plan, settings),
              planJson: JSON.stringify({ name: plan.name, weeks: plan.weeks, sport: plan.sport, longKm: plan.longKm, hoursMult: plan.hoursMult, intensity: plan.intensity, tips: plan.tips }),
              context: aiContextText() + '\nWeek-by-week:\n' + rows.join('\n')
            });
          }
        }, 'Evaluate & adjust with AI')
      : null;
    const regenBtn = llmPlan && aiReady
      ? DS.h('button', {
          class: 'ds-btn ds-btn-ghost ds-btn-xs',
          type: 'button',
          onclick: () => {
            openCoachTab({ task: 'generate', goal: plan.name, context: aiContextText(), mode: settings.llmMode });
          }
        }, 'Regenerate plan')
      : null;

    const newAiBtn = aiReady
      ? DS.h('button', {
          class: 'ds-btn ds-btn-ghost ds-btn-xs',
          type: 'button',
          onclick: () => {
            const goal = prompt('Describe the goal for a new AI plan:', 'e.g. improve cycling power / finish a century / half-marathon');
            if (goal && goal.trim()) {
              openCoachTab({ task: 'generate', goal: goal.trim(), context: aiContextText(), mode: settings.llmMode });
            }
          }
        }, 'New AI plan')
      : null;

    const completedPastWeeks = (p, s) => {
      const ass = DS.plans.assess(p, s.planStart, state.activities, Date.now());
      return ass.weeks.filter((w) => w.index < ass.current.index && w.status !== 'future').length;
    };
    const pastDone = completedPastWeeks(plan, settings);
    const needsEval = llmPlan && aiReady && (llmEvalCache ? pastDone > llmEvalCache.week : pastDone > 0);
    const evalNotice =
      llmPlan && aiReady && needsEval
        ? DS.h('button', {
            class: 'ds-btn ds-btn-danger ds-btn-xs',
            type: 'button',
            onclick: () => {
              const rows = a.weeks
                .filter((w) => w.status !== 'future')
                .map((w) => `Week ${w.index + 1} (${w.status}): planned long ${w.planned.longKm || '-'} km / done ${Math.round(w.actual.longKm)} km; planned hours ${w.targetHours ?? '?'} / done ${w.actual.hours.toFixed(1)}; intensity ${w.planned.intensity || 0}/${w.actual.intensity}`);
              openCoachTab({
                task: 'adjust',
                mode: settings.llmMode,
                evalWeek: pastDone,
                planJson: JSON.stringify({ name: plan.name, weeks: plan.weeks, sport: plan.sport, longKm: plan.longKm, hoursMult: plan.hoursMult, intensity: plan.intensity, tips: plan.tips }),
                context: aiContextText() + '\nWeek-by-week:\n' + rows.join('\n')
              });
            }
          }, `New week completed — evaluate & adjust with AI`)
        : null;

    const adherenceBar =
      a.adherence == null
        ? null
        : DS.h(
            'div',
            { class: 'ds-adhere' },
            DS.h('div', { class: 'ds-adhere-bar' }, DS.h('div', { class: 'ds-adhere-fill', style: `width:${a.adherence}%` })),
            DS.h('span', null, `${a.adherence}% weeks completed`)
          );

    const table = DS.h(
      'table',
      { class: 'ds-table' },
      DS.h('thead', null, DS.h('tr', null, DS.h('th', null, 'Wk'), DS.h('th', null, 'Long'), DS.h('th', null, 'Hours'), DS.h('th', null, 'Hard'), DS.h('th', null, 'Status'))),
      DS.h(
        'tbody',
        null,
        a.weeks.map((w) =>
          DS.h(
            'tr',
            { class: w === cur ? 'ds-cur-week' : '' },
            DS.h('td', null, String(w.index + 1)),
            DS.h('td', null, w.planned.longKm ? `${fmtKm(w.actual.longKm, 0)} / ${fmtKm(w.planned.longKm, 0)}` : '—'),
            DS.h('td', null, w.targetHours != null ? `${w.actual.hours.toFixed(1)} / ${w.targetHours}` : `${w.actual.hours.toFixed(1)} h`),
            DS.h('td', null, w.planned.intensity ? `${Math.min(w.actual.intensity, 9)} / ${w.planned.intensity}` : '—'),
            DS.h('td', null, DS.h('span', { class: `ds-pill ds-pill-${w.status}` }, STATUS_LABEL[w.status] || w.status))
          )
        )
      )
    );

    wrap.append(
      DS.h(
        'div',
        { class: 'ds-group-actions' },
        DS.h('h3', null, `${plan.name} — week ${cur.index + 1} of ${plan.weeks}`),
        DS.h('div', { class: 'ds-mode' }, evalNotice, aiEvalBtn, newAiBtn, regenBtn, DS.h('button', {
          class: 'ds-btn ds-btn-ghost ds-btn-xs',
          type: 'button',
          onclick: async () => {
            await DS.settingsStore.save({ planId: '', planStart: '' });
            renderDashboard();
          }
        }, 'Change plan'))
      ),
      aiModeRow(),
      DS.h('div', { class: 'ds-hint' }, `${a.raceInDays} days to go`),
      adherenceBar,
      nw ? DS.h('div', { class: 'ds-next' }, DS.h('strong', null, 'Next workout: '), nw.text) : null,
      table,
      plan.tips[cur.index] ? DS.h('div', { class: 'ds-hint' }, `💡 ${plan.tips[cur.index]}`) : null,
      DS.h('div', { class: 'ds-hint' }, 'Hard sessions are estimated from your speed baseline and workout names — approximate.')
    );
    return wrap;
  }

  function buildGearNameMap() {
    const map = {};
    for (const sel of document.querySelectorAll('#gear_bike option, #gear_shoe option')) {
      const v = sel.value;
      const label = (sel.textContent || '').trim();
      if (v) map[v] = label;
    }
    return map;
  }

  function renderDashboard() {
    if (!state.dash) return;
    const build = () => {
      const body = state.dash.querySelector('.ds-dash-body');
      if (!body) return;
      body.textContent = '';
      const f = state.dashFilter;
      const add = (name, build) => {
        try {
          const el = build();
          if (el) body.append(el);
        } catch (e) {
          console.error(`[dedupe] dashboard section failed: ${name}`, e);
          body.append(
            DS.h('div', { class: 'ds-chart' },
              DS.h('h3', null, name),
              DS.h('div', { class: 'ds-hint' }, `Render error: ${e.message}`))
          );
        }
      };

    add('Training plan', () => planSection());

    add('Summary cards', () => {
      const now = Date.now();
      const inRange = (a, from, to) => {
        const t = new Date(a.startDateLocal).getTime();
        return Number.isFinite(t) && t >= from && t < to;
      };
      const last30 = state.activities.filter((a) => inRange(a, now - 30 * 86400000, now + 86400000));
      const prev30 = state.activities.filter((a) => inRange(a, now - 60 * 86400000, now - 30 * 86400000));
      const sCur = DS.viz.summary(last30, f);
      const sPrev = DS.viz.summary(prev30, f);
      const pct = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
      return DS.h(
        'div',
        { class: 'ds-cards' },
        dashCard('Activities (30d)', sCur.count, pct(sCur.count, sPrev.count)),
        dashCard('Distance (30d)', fmtDist(sCur.distanceKm * 1000, 0), pct(sCur.distanceKm, sPrev.distanceKm)),
        dashCard('Time (30d)', `${sCur.timeH} h`, pct(sCur.timeH, sPrev.timeH)),
        dashCard('Elevation (30d)', fmtElev(sCur.elevationM), pct(sCur.elevationM, sPrev.elevationM))
      );
    });

    add('Rhythm', () => {
      const s = DS.viz.streaks(state.activities, { days: 90, filter: f });
      const flat = (v) => (v === 0 ? '0' : `${v}d`);
      return DS.h(
        'div',
        { class: 'ds-cards' },
        dashCard('Current streak', flat(s.current), null),
        dashCard('Longest streak', flat(s.longest), null),
        dashCard('Consistency (90d)', `${s.consistencyPct}%`, null),
        dashCard('Longest gap (90d)', flat(s.longestGap), null)
      );
    });

    add('Goals', () => {
      const settings = DS.settingsStore.get();
      const year = new Date().getFullYear();
      const yearActs = state.activities.filter(
        (a) => {
          const d = new Date(a.startDateLocal);
          return Number.isFinite(d.getTime()) && d.getFullYear() === year;
        }
      );
      const distKm = yearActs.reduce((t, a) => t + (a.distanceM || 0) / 1000, 0);
      const elevM = yearActs.reduce((t, a) => t + (a.elevationM || 0), 0);
      const daysElapsed = Math.max(1, Math.round((Date.now() - new Date(`${year}-01-01`).getTime()) / 86400000));
      const daysInYear = Math.round((Date.parse(`${year + 1}-01-01`) - Date.parse(`${year}-01-01`)) / 86400000);
      const progress = (done, goal) => (goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : null);
      const pace = (done, goal) => (goal > 0 ? goal * (daysElapsed / daysInYear) : 0);
      const style = (done, goal) => (goal > 0 && done / goal < daysElapsed / daysInYear ? 'down' : 'up');
      const details = [];
      if (settings.goalDistanceKm > 0) {
        const g = settings.goalDistanceKm;
        details.push([
          'Distance',
          `${fmtDist(distKm * 1000, 0)} / ${fmtDist(g * 1000, 0)}`,
          progress(distKm, g),
          style(distKm, g),
          `${fmtDist(Math.round(pace(distKm, g) * 1000), 0)} of pace this week`,
          DS.h('button', { class: 'ds-btn ds-btn-xs ds-btn-ghost', type: 'button', onclick: async () => { const v = parseFloat(prompt('Year distance goal (km):', String(g)) || '0'); if (Number.isFinite(v) && v >= 0) { await DS.settingsStore.save({ goalDistanceKm: v }); renderDashboard(); } } }, '⚙')
        ]);
      } else {
        details.push(['Distance', `${fmtDist(distKm * 1000, 0)} this year`, null, '', '', DS.h('button', { class: 'ds-btn ds-btn-xs ds-btn-ghost', type: 'button', onclick: async () => { const v = parseFloat(prompt('Year distance goal (km):', '1000') || '0'); if (Number.isFinite(v) && v >= 0) { await DS.settingsStore.save({ goalDistanceKm: v }); renderDashboard(); } } }, 'Set goal')]);
      }
      if (settings.goalElevM > 0) {
        const g = settings.goalElevM;
        details.push([
          'Climbing',
          `${fmtElev(elevM)} / ${fmtElev(g)}`,
          progress(elevM, g),
          style(elevM, g),
          `${fmtElev(Math.round(pace(elevM, g)))} of pace this week`,
          DS.h('button', { class: 'ds-btn ds-btn-xs ds-btn-ghost', type: 'button', onclick: async () => { const v = parseFloat(prompt('Year climbing goal (m):', String(g)) || '0'); if (Number.isFinite(v) && v >= 0) { await DS.settingsStore.save({ goalElevM: v }); renderDashboard(); } } }, '⚙')
        ]);
      }
      const row = (label, val, pct, tone, paceTxt, ctl) =>
        DS.h(
          'div',
          { class: 'ds-top-row' },
          DS.h('span', null, label),
          DS.h('span', null, val, DS.h('span', { class: 'ds-hint', style: 'margin-left:8px' }, pct == null ? '' : `${pct}%`), DS.h('span', { class: `ds-stat-delta ${tone}`, style: 'margin-left:8px;display:inline' }, paceTxt), DS.h('span', { style: 'margin-left:8px' }, ctl))
        );
      if (!details.length) {
        details.push(['Distance', `${fmtDist(distKm * 1000, 0)} this year`, null, '', '', DS.h('button', { class: 'ds-btn ds-btn-xs', type: 'button', onclick: async () => { const v = parseFloat(prompt('Year distance goal (km):', '1000') || '0'); if (Number.isFinite(v) && v >= 0) { await DS.settingsStore.save({ goalDistanceKm: v }); renderDashboard(); } } }, 'Set goals')]);
      }
      return DS.h('div', { class: 'ds-chart ds-top' },
        DS.h('h3', null, `Goals — ${year}`),
        ...details.map((x) => row(...x)),
        DS.h('div', { class: 'ds-hint' }, 'Goals live in Settings. "Pace" is where you need to be to finish on time today.')
      );
    });

    add('When you train', () => {
      const hm = DS.viz.heatmap(state.activities, { days: 180, filter: f });
      if (!hm.total) return null;
      const cell = 16;
      const gap = 2;
      const left = 26;
      const top = 16;
      const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const W = left + 24 * (cell + gap) + 6;
      const H = top + 7 * (cell + gap) + 6;
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
      for (let d = 0; d < 7; d++) {
        svg += `<text x="${left - 5}" y="${top + d * (cell + gap) + cell - 3}" font-size="9" fill="#aaa" text-anchor="end">${DAYS[d]}</text>`;
        for (let h = 0; h < 24; h++) {
          const hours = hm.matrix[d][h];
          const a = hours > 0 ? Math.max(0.12, Math.min(1, 0.25 + (hours / hm.max) * 0.75)) : 0;
          const fill = hours > 0 ? `rgba(252,76,2,${a.toFixed(2)})` : '#efefef';
          svg += `<rect x="${left + h * (cell + gap)}" y="${top + d * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${fill}"><title>${DAYS[d]} ${String(h).padStart(2, '0')}:00 — ${Math.round(hours * 10) / 10} h</title></rect>`;
        }
      }
      for (let h = 0; h < 24; h += 4) {
        svg += `<text x="${left + h * (cell + gap)}" y="11" font-size="9" fill="#888" text-anchor="middle">${('' + h).padStart(2, '0')}</text>`;
      }
      svg += '</svg>';
      return DS.h(
        'div',
        { class: 'ds-chart' },
        DS.h('h3', null, 'When you train — last 180 days'),
        svgFromMarkup(svg)
      );
    });

    add('Power & HR trends', () => {
      const t = DS.viz.monthlyTrends(state.activities, { filter: f });
      if (!t.months.length || (!t.anyHr && !t.anyW)) return null;
      const W = 860;
      const H = 150;
      const pad = { l: 40, r: 10, t: 12, b: 24 };
      const iw = W - pad.l - pad.r;
      const ih = H - pad.t - pad.b;
      const max = Math.max(1, ...t.months.map((m) => Math.max(m.hr || 0, m.watts || 0)));
      const xOf = (i) => pad.l + (i * iw) / Math.max(1, t.months.length - 1);
      const yOf = (v) => pad.t + ih - ((v || 0) / max) * ih;
      const line = (arr, key, stroke) => arr.map((m, i) => `${xOf(i).toFixed(1)},${yOf(m[key]).toFixed(1)}`).join(' ');
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
      for (let g = 0; g <= 4; g++) {
        const y = pad.t + (ih * g) / 4;
        svg += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" stroke="#efefef"/>`;
        svg += `<text x="${pad.l - 6}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#999" text-anchor="end">${Math.round((max * (4 - g)) / 4)}</text>`;
      }
      if (t.anyHr) svg += `<polyline points="${line(t.months, 'hr', null)}" fill="none" stroke="#136ffd" stroke-width="2"/>`;
      if (t.anyW) svg += `<polyline points="${line(t.months, 'watts', null)}" fill="none" stroke="#fc4c02" stroke-width="2"/>`;
      t.months.forEach((m, i) => {
        const label = m.d.toLocaleString([], { month: 'short', year: '2-digit' });
        svg += `<text x="${xOf(i).toFixed(1)}" y="${H - 6}" font-size="9" fill="#999" text-anchor="middle">${label}</text>`;
      });
      svg += '</svg>';
      return DS.h(
        'div',
        { class: 'ds-chart ds-chart-wide' },
        DS.h('h3', null, `Power & HR trends — peak monthly avg${t.anyHr && t.anyW ? ' (blue HR, orange power)' : t.anyHr ? ' (HR)' : ' (power)'}`),
        svgFromMarkup(svg),
        DS.h('div', { class: 'ds-vol-legend' }, DS.h('span', { class: 'ds-hint' }, 'Based on average HR/power recorded on your devices. Strava list rows carry little of this — Intervals.icu rows carry it all.'))
      );
    });

    add('Race predictor', () => {
      const pred = DS.viz.racePredictor(state.activities, { filter: f, distanceKm: 40 });
      if (!pred) return null;
      const fmt = (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.round(secs % 60);
        return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
      };
      return DS.h(
        'div',
        { class: 'ds-chart' },
        DS.h('h3', null, `Race predictor — 40 km from CTL ${pred.ctl} / form ${pred.form > 0 ? '+' : ''}${pred.form}`),
        DS.h('div', { class: 'ds-stat-val' }, fmt(pred.predictedHms)),
        DS.h('div', { class: 'ds-hint' }, `Extrapolated from your best recent ${Math.round(pred.refKm)} km at ${pred.bestKph} km/h. Rough estimate, not gospel.`),
        DS.h('button', {
          class: 'ds-btn ds-btn-ghost ds-btn-xs',
          type: 'button',
          onclick: async () => {
            const km = parseFloat(prompt('Distance to predict (km):', '40') || '40');
            if (Number.isFinite(km) && km > 0) {
              const p = DS.viz.racePredictor(state.activities, { filter: f, distanceKm: km });
              const h = Math.floor(p.predictedHms / 3600);
              const m = Math.floor((p.predictedHms % 3600) / 60);
              els.status.textContent = `Predicted ${km} km: ${h}h ${String(m).padStart(2, '0')}m.`;
              renderDashboard();
            }
          }
        }, 'Change distance')
      );
    });

    add('Distance by week', () => {
      const spanDays = loadedSpanDays();
      const fit = DS.viz.fitRange(spanDays);
      if (!state.volWeeks) state.volWeeks = fit.weeks <= 13 ? 13 : fit.weeks <= 26 ? 26 : 52;
      const weeksN = Math.min(state.volWeeks, fit.weeks);
      const weeks = DS.viz.weeklySeries(state.activities, { weeks: weeksN, filter: f });
      const rangeLabel = weeksN === 13 ? '3 months' : weeksN === 26 ? '6 months' : weeksN === 52 ? '1 year' : `${weeksN} weeks`;
      return DS.h(
        'div',
        { class: 'ds-chart ds-chart-wide' },
        DS.h(
          'div',
          { class: 'ds-chart-head' },
          DS.h('h3', null, `Distance by week — ${rangeLabel}`),
          DS.h(
            'div',
            { class: 'ds-mini-chips' },
            [
              [13, '3M'],
              [26, '6M'],
              [52, '1Y']
            ].map(([n, label]) =>
              DS.h('button', {
                class: `ds-chip ${weeksN === n ? 'ds-chip-on' : ''}`,
                type: 'button',
                onclick: () => setVolRange(n)
              }, label)
            )
          )
        ),
        svgFromMarkup(DS.viz.weeklyBarsSvg(weeks, DS.settingsStore.get().units)),
        DS.h(
          'div',
          { class: 'ds-vol-legend' },
          ['ride', 'run', 'swim', 'other'].map((g) =>
            DS.h('span', { class: 'ds-legend-row' },
              DS.h('span', { class: 'ds-dot', style: `background:${DS.viz.COLORS[g]}` }),
              g[0].toUpperCase() + g.slice(1))
          ),
          DS.h('span', { class: 'ds-legend-row' },
            DS.h('span', { class: 'ds-rolling-line' }),
            '4-week average')
        )
      );
    });

    add('Activity calendar', () => {
      const fit = DS.viz.fitRange(loadedSpanDays());
      const cal = DS.viz.calendarCells(state.activities, { days: fit.calDays, filter: f });
      const svg = svgFromMarkup(DS.viz.calendarSvg(cal));
      const rects = svg.querySelectorAll('rect');
      let ri = 0;
      for (const c of cal.cells) {
        if (c.blank) continue;
        const rect = rects[ri++];
        if (!rect) break;
        const key = DS.viz.dayKey(c.date);
        rect.setAttribute('cursor', 'pointer');
        rect.addEventListener('click', () => {
          const acts = (cal.days[key] || []).filter((x) => x);
          if (acts.length === 1) {
            window.open(acts[0].url, '_blank');
            return;
          }
          state.dashDayKey = key;
          renderDashboard();
        });
      }
      return DS.h(
        'div',
        { class: 'ds-chart ds-chart-wide' },
        DS.h('h3', null, `Activity calendar — last ${fit.calDays} days, by moving time`),
        svg,
        DS.h(
          'div',
          { class: 'ds-scale' },
          'Less',
          DS.viz.CAL_SHADES.map((c) => DS.h('span', { class: 'ds-scale-swatch', style: `background:${c}` })),
          'More'
        ),
        state.dashDayKey && cal.days[state.dashDayKey] ? dayDetailPanel(state.dashDayKey, cal.days[state.dashDayKey]) : null
      );
    });

    add('Load guardrails', () => {
      const g = DS.fitness.guardrails(state.activities);
      const m = DS.fitness.monotonyScore(state.activities);
      if (!g && !m) return null;
      const cell = (label, value, tone, hint) =>
        DS.h(
          'div',
          { class: `ds-stat ${tone ? `ds-stat-${tone}` : ''}` },
          DS.h('div', { class: 'ds-stat-val' }, value),
          DS.h('div', { class: 'ds-stat-label' }, label),
          hint ? DS.h('div', { class: 'ds-stat-delta' }, hint) : null
        );
      const rampTone = g.rampPct == null ? '' : g.rampPct > 15 ? 'down' : '';
      const ctlTone = g.ctlDelta == null ? '' : Math.abs(g.ctlDelta) > 8 ? 'down' : g.ctlDelta > 0 ? 'up' : '';
      const acwrTone = g.acwr == null ? '' : g.acwr > 1.5 ? 'down' : g.acwr >= 1.3 ? 'up' : g.acwr < 0.8 ? 'up' : '';
      const mono = m.monotony;
      const monoTone = mono != null ? (mono >= 2 ? 'down' : mono >= 1.5 ? 'down' : '') : '';
      const strain = m.strain;
      const strainTone = strain != null ? (strain >= 350 ? 'down' : strain >= 250 ? 'down' : '') : '';
      const warn = [...(g?.flags || []), ...(m?.flags || []), ...(m?.strainFlags || [])];
      return DS.h(
        'div',
        { class: 'ds-chart ds-chart-wide' },
        DS.h('h3', null, 'Load guardrails — last 7 days'),
        DS.h(
          'div',
          { class: 'ds-cards' },
          cell('Ramp vs prev 7d', g == null ? '—' : g.rampPct == null ? '—' : `${g.rampPct > 0 ? '+' : ''}${g.rampPct}%`, rampTone, g != null && g.rampPct != null && g.rampPct > 15 ? 'Jump above 15% often marks overreaching' : 'Hours change vs the week before'),
          cell('ACWR (acute:chronic)', g == null ? '—' : g.acwr == null ? '—' : g.acwr, acwrTone, g == null || g.acwr == null ? 'Not enough history' : g.acwr > 1.5 ? 'Above 1.5 — high injury risk' : g.acwr >= 1.3 ? 'Caution zone (1.3–1.5)' : g.acwr < 0.8 ? 'Low load — detraining' : 'Sweet spot (0.8–1.3)'),
          cell('CTL Δ / week', g == null ? '—' : g.ctlDelta == null ? '—' : `${g.ctlDelta > 0 ? '+' : ''}${g.ctlDelta}`, ctlTone, 'Fitness change over the last 7 days'),
          cell('Monotony', mono == null ? '—' : mono, monoTone, mono == null ? 'Need a few weeks of history' : mono >= 2 ? '≥ 2 — same-ish every day, add variety' : mono >= 1.5 ? 'Risky range' : 'Plenty of variety'),
          cell('Training strain', strain == null ? '—' : strain, strainTone, strain == null ? 'Need active days' : strain >= 350 ? '≥ 350 — sustained overload' : strain >= 250 ? 'High' : 'Controllable')
        ),
        warn.length
          ? DS.h('div', { class: 'ds-vol-legend' }, DS.h('span', { class: 'ds-hint' }, `⚠ ${warn.map((w) => ({ ramp: 'ramp jump', ctl: 'CTL spike', 'acwr-high': 'ACWR high', 'acwr-mid': 'ACWR caution', 'acwr-low': 'ACWR low', monotony: 'monotony', 'monotony-mid': 'monotony risk', 'strain-high': 'strain high', 'strain-mid': 'strain ris' })[w]).join(', ')} this week — ease off or pace it.`))
          : null
      );
    });

    add('Fitness & freshness', () => {
      const fit = DS.viz.fitRange(loadedSpanDays());
      const days = Math.min(120, fit.calDays);
      const pts = DS.fitness ? DS.fitness.series(state.activities, { days }) : [];
      if (!DS.fitness || !pts.length) return null;
      const snap = DS.fitness.snapshot(state.activities, { days });
      const svg = svgFromMarkup(DS.fitness.chartSvg(pts));
      const wrap = DS.h(
        'div',
        { class: 'ds-chart ds-chart-wide ds-fit-wrap' },
        DS.h('h3', null, `Fitness (CTL · ATL · TSB) — last ${days} days`),
        svg,
        DS.h(
          'div',
          { class: 'ds-vol-legend' },
          DS.h('span', { class: 'ds-legend-row' }, DS.h('span', { class: 'ds-dot', style: 'background:#136ffd' }), 'CTL (fitness)'),
          DS.h('span', { class: 'ds-legend-row' }, DS.h('span', { class: 'ds-dot', style: 'background:#fc4c02' }), 'ATL (fatigue)'),
          DS.h('span', { class: 'ds-legend-row' }, DS.h('span', { class: 'ds-rolling-line' }), 'TSB (form)'),
          snap ? DS.h('span', { class: 'ds-legend-row' }, `CTL ${snap.ctl} · ATL ${snap.atl} · TSB ${snap.tsb}`) : null
        )
      );
      attachFitHover(wrap, svg, pts);
      return wrap;
    });

    add('Time by sport', () => {
      const shares = DS.viz.sportShares(state.activities, f);
      const donutWrap = DS.h('div', { class: 'ds-chart ds-donut' },
        DS.h('h3', null, 'Time by sport (all loaded)'),
        svgFromMarkup(DS.viz.donutSvg(shares)));
      const legend = DS.h('div', { class: 'ds-legend' });
      for (const s of shares) {
        legend.append(
          DS.h('div', { class: 'ds-legend-row' },
            DS.h('span', { class: 'ds-dot', style: `background:${DS.viz.COLORS[s.group]}` }),
            `${s.label} — ${s.hours} h (${s.pct}%)`)
        );
      }
      donutWrap.append(legend);
      return donutWrap;
    });

    add('Longest in last 90 days', () => {
      const top = DS.viz.topActivities(state.activities, { n: 5, withinDays: 90, filter: f });
      const topEl = DS.h('div', { class: 'ds-chart ds-top' });
      topEl.append(DS.h('h3', null, 'Longest in last 90 days'));
      for (const { a, d } of top) {
        const when = d ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
        const agoN = d ? Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000)) : null;
        const ago = agoN == null ? '' : agoN === 0 ? 'today' : agoN === 1 ? '1 day ago' : `${agoN} days ago`;
        topEl.append(
          DS.h(
            'div',
            { class: 'ds-top-row' },
            DS.h('a', { href: actUrl(a), target: '_blank', rel: 'noreferrer' }, a.name || `#${a.id}`),
            DS.h('span', null, `${when}${ago ? ` (${ago})` : ''} · ${((a.distanceM || 0) / 1000).toFixed(1)} km · ${fmtTime(a.movingTimeS)}`)
          )
        );
      }
      if (!top.length) topEl.append(DS.h('div', { class: 'ds-hint' }, 'No dated activities in range.'));
      return topEl;
    });

    add('Data quality', () => {
      const issues = DS.viz.qualityFlags(state.activities, { filter: f, n: 30 });
      if (!issues.length) return null;
      const LABEL = {
        'no-gps': 'No GPS',
        'speed-high': 'Implausible speed',
        'speed-low': 'Very slow for distance',
        'hr-weird': 'Suspicious HR',
        truncated: 'Truncated GPS'
      };
      const rows = issues.map(({ a, flags, detail }) =>
        DS.h(
          'div',
          { class: 'ds-top-row' },
          DS.h('a', { href: actUrl(a), target: '_blank', rel: 'noreferrer' }, a.name || `#${a.id}`),
          DS.h('span', null, flags.map((fl) => LABEL[fl] || fl).join(', '), detail.length ? DS.h('span', { class: 'ds-hint', style: 'margin-left:8px' }, `(${detail.join('; ')})`) : null)
        )
      );
      return DS.h('div', { class: 'ds-chart ds-top' },
        DS.h('h3', null, `Data quality — ${issues.length} flagged`),
        ...rows,
        DS.h('div', { class: 'ds-hint' }, 'Suspicious speed/HR/GPS heuristics — check before deleting anything.'));
    });

    add('Gear mileage', () => {
      const gears = DS.viz.gearSummary(state.activities, { filter: f });
      if (!gears.length) return null;
      const units = DS.settingsStore.get().units;
      const names = buildGearNameMap();
      const gs = DS.settingsStore.get().gearService || {};
      const save = async (patch) => {
        await DS.settingsStore.save({ gearService: { ...gs, ...patch } });
        renderDashboard();
      };
      const rows = gears.slice(0, 12).map((g) => {
        const name = names[g.gearId] ? names[g.gearId] : `Gear #${g.gearId}`;
        const svc = gs[g.gearId];
        const distKm = g.distM / 1000;
        const sinceKm = svc && svc.everyKm ? Math.max(0, distKm - (svc.lastKm || 0)) : null;
        const remainingKm = sinceKm != null ? svc.everyKm - sinceKm : null;
        const due = remainingKm != null && remainingKm <= 0;
        const dueSoon = remainingKm != null && !due && remainingKm < svc.everyKm * 0.1;
        const setInterval = DS.h('button', {
          class: 'ds-btn ds-btn-xs ds-btn-ghost',
          type: 'button',
          title: svc ? `Service every ${svc.everyKm} km` : 'Set a service interval (km)',
          onclick: async () => {
            const km = parseFloat(prompt(`Service interval for ${name} (km):`, String(svc?.everyKm || 3000)) || '');
            if (!Number.isFinite(km) || km <= 0) return;
            await save({ [g.gearId]: { everyKm: km, lastKm: svc?.lastKm ?? 0 } });
          }
        }, '🔧');
        const serviced = DS.h('button', {
          class: 'ds-btn ds-btn-xs ds-btn-ghost',
          type: 'button',
          title: 'Mark this gear as just serviced',
          disabled: svc ? null : '',
          onclick: async () => {
            await save({ [g.gearId]: { everyKm: svc?.everyKm || 3000, lastKm: distKm } });
          }
        }, '✓ svc');
        const wrap = DS.h('div', null,
          DS.h(
            'div',
            { class: 'ds-top-row' },
            DS.h('a', { href: null }, name),
            DS.h('span', null, `${g.count} rides · ${DS.units.dist(g.distM, units, 0)} · ${fmtTime(g.timeS)}`),
            serviced,
            setInterval
          ),
          g.distM > 0 && g.timeS > 0
            ? DS.h(
                'div',
                { class: 'ds-top-sub' },
                `avg ${(g.distM / g.timeS * 3.6).toFixed(1)} km/h · climbs ${DS.units.elev(g.elevM, units)}`
              )
            : null,
          svc && sinceKm != null
            ? DS.h(
                'div',
                { class: `ds-top-sub ${due ? 'ds-due' : dueSoon ? 'ds-due-soon' : ''}` },
                `since service ${DS.units.dist(sinceKm * 1000, units, 0)} of ${DS.units.dist(svc.everyKm * 1000, units, 0)}` +
                  (remainingKm > 0 ? ` — ${DS.units.dist(remainingKm * 1000, units, 0)} left` : '') +
                  (due ? ' — OVERDUE' : dueSoon ? ' — due soon' : '')
              )
            : null
        );
        return wrap;
      });
      return DS.h('div', { class: 'ds-chart ds-top' },
        DS.h('h3', null, 'Gear mileage'),
        ...rows,
        DS.h('div', { class: 'ds-hint' }, 'Gear names are read from the page when available; otherwise shown by id. Set a 🔧 interval to track time since service.'));
    });

    add('Year in review', () => {
      const years = DS.viz.yearSummaries(state.activities, { filter: f });
      if (!years.length) return null;
      const units = DS.settingsStore.get().units;
      const totals = (y) => `${y.count} · ${DS.units.dist(y.distKm * 1000, units, 0)} · ${Math.round(y.timeH * 10) / 10} h · ${DS.units.elev(y.elevM, units)}`;
      const bySport = {};
      if (f === 'all') {
        for (const g of DS.viz.GROUPS) bySport[g] = DS.viz.yearSummaries(state.activities, { filter: g });
      }
      const rows = [];
      for (const y of years.slice(0, 8)) {
        rows.push(
          DS.h(
            'div',
            { class: 'ds-top-row' },
            DS.h('span', null, String(y.year)),
            DS.h('span', null, totals(y))
          )
        );
        for (const g of DS.viz.GROUPS) {
          const ys = (bySport[g] || []).find((x) => x.year === y.year);
          if (!ys || !ys.count) continue;
          rows.push(
            DS.h(
              'div',
              { class: 'ds-top-row ds-top-sub' },
              DS.h('span', null, g[0].toUpperCase() + g.slice(1)),
              DS.h('span', null, totals(ys))
            )
          );
        }
      }
      return DS.h('div', { class: 'ds-chart ds-top' },
        DS.h('h3', null, 'Year in review'),
        ...rows,
        DS.h(
          'div',
          { class: 'ds-share-card' },
          DS.h(
            'div',
            { class: 'ds-group-actions' },
            DS.h('strong', null, 'Share card'),
            DS.h('button', { class: 'ds-btn ds-btn-xs', type: 'button', onclick: () => downloadShareCard() }, '⬇ Download PNG')
          ),
          buildShareCard()
        )
      );
    });
    };
    ensureLlmPlan().then(async (p) => {
      if (p) llmPlanCache = p;
      const ev = await DS.kv.get(EVAL_KEY);
      if (ev && ev.week != null) llmEvalCache = ev;
      const cp = await DS.kv.get(CUSTOM_PLANS_KEY);
      if (Array.isArray(cp)) llmCustomPlansCache = cp;
      build();
    });
  }

  function commonAncestor(a, b) {
    const set = new Set();
    for (let p = a; p; p = p.parentElement) set.add(p);
    for (let p = b; p; p = p.parentElement) if (set.has(p)) return p;
    return document.body;
  }

  const exactText = (t) => (el) => (el.textContent || '').trim() === t;
  const stripOf = (el) => el.closest('ul, [role="tablist"], nav') || el.parentElement;

  function findTabStrip() {
    const sel = 'a, button, [role="tab"], li, span, div';
    const mine = [...document.querySelectorAll(sel)].filter(exactText('My Activities'));
    const del = [...document.querySelectorAll(sel)].filter(exactText('Recently Deleted'));

    for (const m of mine) {
      for (const d of del) {
        const sm = stripOf(m);
        const sd = stripOf(d);
        if (!sm || sm !== sd || sm === document.body) continue;
        const mTab = [...sm.children].find(exactText('My Activities'));
        const dTab = [...sm.children].find(exactText('Recently Deleted'));
        if (mTab && dTab) return { strip: sm, mine: mTab, deleted: dTab };
      }
    }

    for (const m of mine) {
      const sm = stripOf(m);
      if (!sm || sm === document.body) continue;
      const mTab = [...sm.children].find(exactText('My Activities'));
      if (mTab) return { strip: sm, mine: mTab, deleted: mTab };
    }
    return null;
  }

  function activitiesPanelsFor(strip) {
    const table = document.querySelector('table');
    if (!table) return [];
    const common = commonAncestor(strip, table);
    const climb = (el) => {
      let p = el;
      while (p && p.parentElement && p.parentElement !== common) p = p.parentElement;
      return p;
    };
    const stripChild = climb(strip);
    const panels = [];
    for (const child of common.children) {
      if (child === stripChild || child.id === 'ds-dedupe-dashboard') continue;
      if (child.matches('nav, header, footer, aside')) continue;
      if (child.querySelector('nav, header, footer, aside')) continue;
      panels.push(child);
    }
    return panels;
  }

  function themeOurTab(tab, strip) {
    try {
      const labelOf = (li) => li.querySelector('a, span, button') || li;
      const natives = [...strip.children].filter((li) => li !== tab && !li.hasAttribute?.('data-ds-tab'));
      if (!natives.length) return;
      const selLi =
        natives.find((li) => [...(li.classList || [])].some((c) => /selected|active|current/i.test(c))) || null;
      const baseLi = natives.find((li) => li !== selLi) || natives[0];
      const PROPS = [
        'color',
        'background-color',
        'padding',
        'font-size',
        'font-weight',
        'font-family',
        'line-height',
        'letter-spacing',
        'text-transform',
        'border-radius'
      ];
      const grab = (li) => {
        const el = labelOf(li);
        const cs = getComputedStyle(el);
        return PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
      };
      const base = grab(baseLi);
      const active = selLi ? grab(selLi) : base;
      const style = document.createElement('style');
      style.dataset.dsTabTheme = '1';
      style.textContent = `
        li[data-ds-tab] > span, li[data-ds-tab] > a, span[data-ds-tab] {
          ${base} !important;
          text-decoration: none !important;
          cursor: pointer !important;
          display: inline-block;
        }
        li[data-ds-tab]:hover > span, li[data-ds-tab]:hover > a, span[data-ds-tab]:hover {
          color:${getComputedStyle(labelOf(selLi || baseLi)).color} !important;
        }
        ${
          selLi
            ? `li[data-ds-tab].selected > span, li[data-ds-tab].selected > a,
               li[data-ds-tab].active > span, li[data-ds-tab].active > a,
               li[data-ds-tab].current > span, li[data-ds-tab].current > a {
            ${active} !important;
          }`
            : ''
        }
      `;
      document.head.append(style);
    } catch (e) {
      DS.debug?.('tab theming failed', e);
    }
  }

  function integrateTabs() {
    if (state.tab) return true;
    const found = findTabStrip();
    if (!found) return false;
    const { strip, mine, deleted } = found;

    const anchor = deleted || mine;
    const tab = anchor.cloneNode(true);
    tab.removeAttribute?.('id');
    for (const cls of [...(tab.classList || [])]) {
      if (/selected|active|current/i.test(cls)) tab.classList.remove(cls);
    }
    for (const attr of [...(tab.attributes || [])]) {
      if (attr.name.startsWith('data-') && attr.name !== 'data-ds-tab') tab.removeAttribute(attr.name);
    }
    tab.setAttribute('data-ds-tab', '1');

    const deAnchor = (el) => {
      const span = document.createElement('span');
      span.className = el.className;
      span.textContent = el.textContent;
      el.replaceWith(span);
      return span;
    };
    for (const a of [...tab.querySelectorAll('a')]) deAnchor(a);
    let workTab = tab;
    if (workTab.tagName === 'A') {
      const span = deAnchor(workTab);
      workTab = span;
    }

    const label = workTab.querySelector('span, button') || workTab;
    label.textContent = 'Training Goals & Summary';
    workTab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activateOurTab({ strip, tab: workTab });
    });
    anchor.after(workTab);
    themeOurTab(workTab, strip);
    requestAnimationFrame(() => {
      const r = workTab.getBoundingClientRect();
      if (!r.width || !r.height) {
        workTab.style.display = 'inline-block';
        workTab.style.padding = '8px 16px';
        workTab.style.cursor = 'pointer';
        workTab.style.fontWeight = '600';
        workTab.style.color = '#fc4c02';
        workTab.style.background = '#fff';
      }
      console.info('[dedupe] tab inserted:', workTab.outerHTML.slice(0, 140));
    });

    const TAB_LABEL = 'Training Goals & Summary';
    const ensureTab = () => {
      if (!workTab.isConnected) {
        const fresh = findTabStrip();
        const ref = fresh ? fresh.deleted || fresh.mine : null;
        if (ref && ref.parentElement) ref.after(workTab);
        else strip.appendChild(workTab);
        themeOurTab(workTab, strip);
      }
      const l = workTab.querySelector('span, a, button') || workTab;
      if ((l.textContent || '').trim() !== TAB_LABEL) l.textContent = TAB_LABEL;
    };
    let labelTimer = null;
    new MutationObserver(() => {
      clearTimeout(labelTimer);
      labelTimer = setTimeout(ensureTab, 400);
    }).observe(strip, { childList: true, subtree: true, characterData: true });
    ensureTab();

    strip.addEventListener(
      'click',
      (e) => {
        const t = e.target.closest('[data-ds-tab]');
        if (!t) showActivitiesTab();
      },
      true
    );

    const panels = activitiesPanelsFor(strip);
    state.tab = { strip, tab, panels };
    if (state.activities.length && !state.dash) createDashHostFor(strip);
    if (state.dash) state.dash.style.display = 'none';
    console.info('[dedupe] integrated into training page tabs');
    return true;
  }

  function findMountPointFor(strip) {
    const common = commonAncestor(strip, document.querySelector('table') || strip);
    let panel = document.querySelector('table');
    if (panel) {
      while (panel.parentElement && panel.parentElement !== common) panel = panel.parentElement;
    }
    if (panel && panel !== strip) return { parent: common, before: panel };
    return { parent: strip.parentElement || document.body, before: strip.nextSibling };
  }

  function activateOurTab({ strip, tab }) {
    const activeCls = detectActiveClass(strip);
    if (activeCls) {
      for (const t of strip.querySelectorAll('a, li, [role="tab"]')) {
        if (t.hasAttribute('data-ds-tab')) continue;
        t.classList?.remove(activeCls);
      }
      tab.classList?.add(activeCls);
    }
    for (const p of state.tab?.panels || []) p.style.display = 'none';
    document.title = 'Training Goals & Summary | Strava';
    if (!state.dash || !state.dash.isConnected) {
      state.dash = null;
      createDashHostFor(strip);
    }
    if (state.activities.length) renderDashboard();
    if (state.dash) {
      state.dash.style.display = 'block';
      state.dash.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showActivitiesTab() {
    const t = state.tab;
    if (!t) return;
    const activeCls = detectActiveClass(t.strip);
    if (activeCls) t.tab.classList?.remove(activeCls);
    for (const p of t.panels || []) p.style.display = '';
    document.title = 'My Activities | Strava';
    if (state.dash) state.dash.style.display = 'none';
  }

  function detectActiveClass(strip) {
    for (const t of strip.querySelectorAll('a, li, [role="tab"], button')) {
      if (t.hasAttribute('data-ds-tab')) continue;
      for (const cls of t.classList || []) {
        if (/active|selected|current/i.test(cls)) return cls;
      }
    }
    return null;
  }

  const CACHE_KEY = 'activityCache';
  const CACHE_MAX = 5000;
  const JOB_KEY = 'coachJob';
  const RESULT_KEY = 'llmResult';
  const PLAN_KEY = 'llmPlan';
  const CUSTOM_PLANS_KEY = 'customPlans';
  const EVAL_KEY = 'llmEval';

  let llmPlanCache = null;
  let llmEvalCache = null;
  let llmCustomPlansCache = null;

  function aiContextText() {
    let t = DS.plans.buildTrainingSummary(state.activities, { weeks: 12 });
    if (DS.fitness) {
      const s = DS.fitness.snapshot(state.activities, { days: 90 });
      if (s) t += `\nFitness snapshot: CTL ${s.ctl} · ATL ${s.atl} · TSB ${s.tsb}.`;
    }
    return t;
  }
  async function ensureLlmPlan() {
    if (!llmPlanCache) {
      const p = await DS.kv.get(PLAN_KEY);
      if (p && typeof p === 'object' && Array.isArray(p.longKm)) llmPlanCache = p;
    }
    return llmPlanCache;
  }

  function llmPlanFor() {
    return llmPlanCache;
  }

  function openCoachTab(job) {
    const nonce = String(Date.now());
    const payload = { nonce, at: Date.now(), ...job };
    DS.kv.set(JOB_KEY, payload).then(async () => {
      const url = chrome.runtime.getURL('coach.html');
      const query = 'nonce=' + encodeURIComponent(nonce);
      let opened = false;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'openCoach', query });
        opened = !!(res && res.ok);
      } catch (e) {
        DS.debug?.('openCoach message failed', e);
      }
      if (!opened) {
        try {
          window.open(url + '?' + query, '_blank');
        } catch (e2) {
          els.status.textContent = 'Could not open the coach tab automatically — go to chrome://extensions → service worker to open coach.html.';
          return;
        }
      }
      els.status.textContent = 'AI coach opened in a new tab…';
      let waited = 0;
      const poll = setInterval(async () => {
        waited += 1500;
        const res = await DS.kv.get(RESULT_KEY);
        if (res && res.nonce === nonce) {
          clearInterval(poll);
          await DS.kv.set(RESULT_KEY, null);
          if (res.ok && job.task === 'generate' && res.plan) {
            llmPlanCache = res.plan;
            llmEvalCache = { week: 0 };
            await DS.kv.set(PLAN_KEY, res.plan);
            await DS.kv.set(EVAL_KEY, llmEvalCache);
            await DS.settingsStore.save({ planId: 'llm' });
            els.status.textContent = 'AI plan loaded.';
          } else if (res.ok && job.task === 'adjust' && res.plan) {
            llmPlanCache = res.plan;
            llmEvalCache = { week: Number(job.evalWeek) || Math.max(0, (llmEvalCache && llmEvalCache.week) || 0) };
            await DS.kv.set(PLAN_KEY, res.plan);
            await DS.kv.set(EVAL_KEY, llmEvalCache);
            els.status.textContent = res.adjustments && res.adjustments.reasoning ? 'Plan adjusted: ' + res.adjustments.reasoning : 'Plan adjusted.';
          } else {
            els.status.textContent = 'AI coach: ' + (res.error || 'no result');
          }
          renderDashboard();
          return;
        }
        if (waited > 5 * 60 * 1000) clearInterval(poll);
      }, 1500);
    });
  }

  async function persistCache() {
    const acts = state.activities.slice(0, CACHE_MAX);
    await DS.kv.set(CACHE_KEY, { savedAt: Date.now(), activities: acts });
  }

  async function loadCache() {
    const c = await DS.kv.get(CACHE_KEY);
    if (!c || !Array.isArray(c.activities)) return [];
    return c.activities.filter((a) => a && a.id);
  }

  async function enrichState() {
    if (DS.site.id !== 'strava') return; // icu API rows are already fully enriched
    if (!DS.settingsStore.get().enrichPairs) return;
    const needed = state.groups.flatMap((g) => g.scores.map((s) => s.act));
    const todo = needed.filter((a) => !a.prCount && !a.hasHr && !a.deviceName);
    if (!todo.length) return;
    els.status.textContent = `Enriching ${todo.length} activities from their pages…`;
    let updated = 0;
    for (const a of todo) {
      try {
        const d = await DS.scanner.fetchActivityDetail(a.id);
        if (d) {
          Object.assign(a, d);
          if (d.polyline) a.polyline = d.polyline;
          updated += 1;
        }
      } catch (e) {
        DS.debug?.('enrich failed', a.id, e);
      }
    }
    if (updated) {
      state.groups = DS.dedupe.findGroups(state.activities, DS.settingsStore.get());
      await persistCache();
      els.status.textContent = `Enriched ${updated} activity pages.`;
    }
  }

  function afterDataChanged() {
    const dupes = state.groups.reduce((n, g) => n + g.remove.length, 0);
    els.summary.hidden = !state.groups.length;
    els.summary.textContent = `${state.groups.length} duplicate group${state.groups.length === 1 ? '' : 's'} · ${dupes} deletable ${dupes === 1 ? 'copy' : 'copies'}`;
    if (state.groups.length) renderGroups();
    else els.results.textContent = '';
    applyBadges();
    if (state.dash) renderDashboard();
  }

  function autoScan() {
    if (state.activities.length || state.scanning) return;
    state.scanning = true;
    DS.settingsStore.load()
      .then(async (settings) => {
        const cached = await loadCache();
        if (cached.length) {
          state.activities = cached;
          state.groups = DS.dedupe.findGroups(state.activities, settings);
          afterDataChanged();
        }

        if (!cached.length) {
          const scope = settings.scanScope || '100';
          let maxPages = 5;
          let stopAfter = 100;
          let searchDateStart = '';
          if (scope !== '100') {
            maxPages = scope === 'all' ? 400 : Math.ceil(Number(scope) / 20) + 10;
            stopAfter = 0;
            if (scope !== 'all') {
              searchDateStart = new Date(Date.now() - Number(scope) * 86400000).toISOString().slice(0, 10);
            }
          }
          const res = await api().scanAll({ settings, maxPages, stopAfter, searchDateStart, delayMs: 200 });
          state.activities = res.activities;
          state.groups = DS.dedupe.findGroups(state.activities, settings);
          console.info(`[dedupe] auto-scan: ${res.activities.length} activities, ${state.groups.length} duplicate groups`);
          afterDataChanged();
          await persistCache();
          await enrichState();
          afterDataChanged();
          return;
        }

        const knownIds = new Set(state.activities.map((a) => a.id));
        const res = await api().scanAll({ settings, knownIds, maxPages: 10, delayMs: 200 });
        console.info(`[dedupe] cache: ${state.activities.length} cached, ${res.activities.length} new`);
        const newIds = new Set(res.activities.map((a) => a.id));
        // Always merge: REST rows carry metrics (distance/time) that sparse DOM
        // rows in the cache lack, so even 0 *new* ids can enrich known ones.
        const merged = mergeActivities(res.activities);
        if (merged.length) {
          await persistCache();
          afterDataChanged();
          await enrichState();
          afterDataChanged();
          const freshDupes = state.groups.filter((g) => g.scores.some((s) => newIds.has(s.act.id)));
          if (freshDupes.length) {
            els.summary.textContent = `🚩 ${freshDupes.length} new activit${freshDupes.length === 1 ? 'y' : 'ies'} look like duplicate${freshDupes.length === 1 ? '' : 's'} — review below.`;
            els.summary.hidden = false;
            if (state.dash) renderDashboard();
          }
        } else if (state.activities.length && !state.groups.length) {
          afterDataChanged();
        }
      })
      .catch((e) => {
        console.error('[dedupe] auto-scan failed', e);
        els.status.textContent = `Auto-scan failed: ${e.message}`;
      })
      .finally(() => {
        state.scanning = false;
      });
  }

  function applyBadges() {
    if (!state.groups || !state.groups.length) return;
    const map = new Map();
    state.groups.forEach((g, gi) => {
      for (const s of g.scores) {
        map.set(s.act.id, { g, gi, keep: s.act === g.keep });
      }
    });
    const links = document.querySelectorAll('a[href*="/activities/"]');
    for (const link of links) {
      const m = (link.getAttribute('href') || '').match(DS.site.linkIdRe);
      if (!m || !map.has(m[1])) continue;
      const row = link.closest('tr, .training-activity-row, li');
      if (!row || row.querySelector('.ds-dup-badge')) continue;
      if (link.closest('#ds-dedupe-dashboard') || link.closest('#ds-dedupe-root')) continue;
      const info = map.get(m[1]);
      const badge = DS.h('button', {
        class: `ds-dup-badge ${info.keep ? 'ds-dup-keep' : 'ds-dup-del'}`,
        type: 'button',
        title: info.keep
          ? `Duplicate group ${info.gi + 1}: recommended KEEP (${info.g.remove.length} copy${info.g.remove.length === 1 ? '' : 's'} found). Click to review.`
          : `Duplicate group ${info.gi + 1}: recommended DELETE. Click to review.`,
        onclick: () => reviewGroup(info.gi)
      }, '⧉');
      link.after(badge);
    }
  }

  function reviewGroup(gi) {
    toggle(true);
    if (!els.results.querySelector('.ds-group')) renderGroups();
    const card = els.results.querySelectorAll('.ds-group')[gi];
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function watchTable() {
    if (state.badgeObserver || typeof MutationObserver === 'undefined') return;
    let timer = null;
    state.badgeObserver = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(applyBadges, 600);
    });
    state.badgeObserver.observe(document.body, { childList: true, subtree: true });
  }

  function integrate() {
    if (!document.querySelector('style[data-ds-page-css]')) {
      const s = document.createElement('style');
      s.dataset.dsPageCss = '1';
      s.textContent = DS.PAGE_CSS;
      document.head?.append(s);
    }
    if (DS.site.id !== 'strava') {
      // No tab strip to hook into off Strava — the floating panel is the UI.
      watchTable();
      autoScan();
      return;
    }
    let tries = 0;
    const attempt = () => {
      tries += 1;
      const ok = integrateTabs();
      if (ok) {
        watchTable();
        autoScan();
        return;
      }
      if (tries < 40) setTimeout(attempt, 500);
      else console.info('[dedupe] training tabs not found — running in panel-only mode');
    };
    attempt();
  }

  async function searchByRange(from, to) {
    if (!from || !to) {
      els.status.textContent = 'Pick both dates for the range search.';
      return;
    }
    const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000));
    const settings = DS.settingsStore.get();
    els.status.textContent = `Searching ${from} → ${to}…`;
    try {
      const res = await api().scanAll({
        settings,
        searchDateStart: from,
        searchDateEnd: to,
        maxPages: Math.ceil(days / 20) + 10,
        delayMs: 150,
        onProgress: ({ page, loaded }) => {
          els.status.textContent = `Searching ${from} → ${to}… ${loaded} loaded (${page} pages)`;
        }
      });
      const groups = DS.dedupe.findGroups(res.activities, settings);
      els.results.textContent = '';
      els.results.append(
        DS.h('div', { class: 'ds-summary' }, `Range ${from} → ${to}: ${res.activities.length} activities, ${groups.length} duplicate group${groups.length === 1 ? '' : 's'}`)
      );
      if (!groups.length) {
        els.results.append(DS.h('div', { class: 'ds-placeholder' }, 'No duplicates in this range. 🎉'));
        return;
      }
      const saved = state.groups;
      state.groups = groups;
      renderGroups();
      state.groups = saved;
    } catch (e) {
      els.status.textContent = `Search failed: ${e.message}`;
    }
  }

  async function searchById(idRaw) {
    const id = DS.site.parseIdInput(idRaw);
    if (!id) {
      els.status.textContent = DS.site.id === 'intervals' ? 'Enter an activity id (from its URL).' : 'Enter an activity number (the digits in its URL).';
      return;
    }
    els.status.textContent = `Fetching activity #${id}…`;
    try {
      const meta = await api().fetchActivityMeta(id);
      if (!meta) {
        els.status.textContent = `Activity #${id} not found (private, deleted, or not yours).`;
        return;
      }
      els.status.textContent = `#${id}: ${meta.name || 'untitled'} — ${fmtDate(meta.startDateLocal)}. Searching ±3 weeks…`;
      if (!meta.startDateLocal) {
        els.results.textContent = '';
        els.results.append(
          DS.h('div', { class: 'ds-summary' }, `#${id} — ${meta.name || 'untitled'}: date not readable from the page, cannot search around it.`)
        );
        return;
      }
      const t = Date.parse(meta.startDateLocal);
      const from = new Date(t - 21 * 86400000).toISOString().slice(0, 10);
      const to = new Date(t + 86400000).toISOString().slice(0, 10);
      const settings = DS.settingsStore.get();
      const res = await api().scanAll({
        settings,
        searchDateStart: from,
        searchDateEnd: to,
        maxPages: Math.ceil(28 / 20) + 5,
        delayMs: 150
      });
      const pool = [meta, ...res.activities.filter((a) => a.id !== meta.id)];
      const groups = DS.dedupe.findGroups(pool, settings).filter((g) => g.scores.some((s) => s.act.id === meta.id));
      els.results.textContent = '';
      els.results.append(
        DS.h(
          'div',
          { class: 'ds-summary' },
          groups.length
            ? `#${id} (${meta.name || 'untitled'}, ${fmtDate(meta.startDateLocal)}): ${groups.length} potential duplicate match${groups.length === 1 ? '' : 'es'} found.`
            : `#${id} (${meta.name || 'untitled'}, ${fmtDate(meta.startDateLocal)}): no duplicates found within ±3 weeks.`
        )
      );
      if (!groups.length) return;
      const saved = state.groups;
      state.groups = groups;
      renderGroups();
      state.groups = saved;
    } catch (e) {
      els.status.textContent = `Search failed: ${e.message}`;
    }
  }

  DS.panel = { mount, state, integrate, mergeActivities, _findTabStrip: findTabStrip };
})();
