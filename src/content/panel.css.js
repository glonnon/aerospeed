(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  DS.PANEL_CSS = `    :host, :host * { box-sizing: border-box; }
    .ds-fab {
      position: fixed; right: 20px; bottom: 20px; z-index: 99998;
      width: 46px; height: 46px; border-radius: 50%; border: none; cursor: pointer;
      background: #fc5200; color: #fff; font-weight: 700; font-size: 15px;
      box-shadow: 0 2px 10px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center;
    }
    .ds-fab:hover { background: #e04a00; }
    .ds-panel {
      position: fixed; top: 16px; right: 16px; bottom: 16px; z-index: 99999;
      width: 430px; max-width: calc(100vw - 32px);
      background: #fff; color: #242428; border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,.35);
      display: flex; flex-direction: column; overflow: hidden;
      font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .ds-panel[hidden] { display: none; }
    .ds-hdr {
      display: flex; align-items: center; gap: 8px; padding: 12px 14px;
      background: #fc5200; color: #fff; flex: none;
    }
    .ds-hdr strong { font-size: 15px; flex: 1; }
    .ds-hdr .ds-ver { font-size: 11px; opacity: .85; }
    .ds-iconbtn {
      background: transparent; border: none; color: #fff; font-size: 16px;
      cursor: pointer; padding: 4px 6px; border-radius: 6px;
    }
    .ds-iconbtn:hover { background: rgba(255,255,255,.18); }
    .ds-body { flex: 1; overflow-y: auto; padding: 14px; }
    .ds-status { margin: 0 0 10px; color: #666; min-height: 20px; }
    .ds-btn {
      background: #fc5200; color: #fff; border: none; border-radius: 6px;
      padding: 9px 14px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .ds-btn:hover { background: #e04a00; }
    .ds-btn[disabled] { opacity: .55; cursor: default; }
    .ds-btn-ghost { background: transparent; color: #fc5200; border: 1px solid #fc5200; }
    .ds-btn-ghost:hover { background: rgba(252,82,0,.08); }
    .ds-btn-xs { padding: 2px 8px; font-size: 12px; font-weight: 400; }
    .ds-drawer { border: 1px solid #e6e6e6; border-radius: 8px; margin-top: 14px; overflow: hidden; }
    .ds-drawer-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; background: #f7f7f8; cursor: pointer; font-weight: 600;
    }
    .ds-drawer[open] .ds-drawer-head::after { content: "▾"; }
    .ds-drawer:not([open]) .ds-drawer-head::after { content: "▸"; }
    .ds-drawer-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .ds-field label { display: block; font-size: 12px; color: #555; margin-bottom: 3px; font-weight: 600; }
    .ds-ctl input[type="number"], .ds-ctl select {
      width: 100%; padding: 7px 9px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px;
    }
    .ds-ctl-range { display: flex; align-items: center; gap: 8px; }
    .ds-ctl-range input { flex: 1; }
    .ds-range-val { font-size: 12px; font-weight: 600; min-width: 42px; text-align: right; }
    .ds-warning {
      display: none; padding: 9px 11px; border-radius: 6px; font-size: 12.5px;
      background: #fff3cd; color: #664d03; border: 1px solid #ffe69c;
    }
    .ds-warning.ds-visible { display: block; }
    .ds-rank { display: flex; flex-direction: column; gap: 4px; }
    .ds-rank-row {
      display: flex; align-items: center; justify-content: space-between;
      background: #f7f7f8; border-radius: 6px; padding: 4px 8px;
    }
    .ds-rank-label { font-size: 13px; }
    .ds-actions { display: flex; justify-content: flex-end; }
    .ds-results { margin-top: 14px; }
    .ds-placeholder { color: #999; font-size: 13px; padding: 14px 0; text-align: center; }
    .ds-summary {
      padding: 8px 11px; border-radius: 6px; background: #f1f3f5; font-weight: 600; font-size: 13px;
    }
    .ds-stale {
      padding: 8px 11px; border-radius: 6px; font-size: 12.5px;
      background: #e7f1ff; color: #084298; border: 1px solid #b6d4fe;
    }
    .ds-group { border: 1px solid #e6e6e6; border-radius: 8px; padding: 10px; margin-bottom: 12px; }
    .ds-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .ds-table th, .ds-table td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    .ds-table th { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
    .ds-table th:last-child, .ds-table td:last-child { border-right: 2px solid #ffd9c9; }
    .ds-rowlabel { color: #888; white-space: nowrap; }
    .ds-delcol input { margin-left: 6px; }
    .ds-score { font-weight: 700; }
    .ds-score.pos { color: #157347; }
    .ds-score.neg { color: #b02a37; }
    .ds-group-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 9px; }
    .ds-uncertain { color: #996a00; font-size: 12px; font-weight: 600; }
    .ds-btn-danger { background: #b02a37; }
    .ds-btn-danger:hover { background: #93232e; }
    .ds-group .ds-links { margin-top: 8px; }
    .ds-bottom { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
    .ds-mode { display: flex; align-items: center; gap: 6px; }
    .ds-btn-ghost-active { background: rgba(252,82,0,.14); }
    .ds-links {
      width: 100%; font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace;
      border: 1px solid #ddd; border-radius: 6px; padding: 8px; color: #444; background: #fafafa;
    }
    .ds-hint { color: #888; font-size: 12px; }
    .ds-actions-row { display: flex; gap: 8px; }
    .ds-actions-row .ds-btn { flex: 1; }
    .ds-dash {
      display: block; width: 100%; margin: 0 0 24px; padding: 0;
      background: transparent; overflow: visible;
    }
    .ds-dash-card {
      background: #fff; border: 1px solid #dcdcdc; border-radius: 4px;
      box-shadow: none; overflow: hidden;
      font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #242428;
    }
    .ds-dash-hdr {
      display: flex; align-items: baseline; gap: 12px; padding: 14px 18px 10px;
      background: #fff; color: #242428; border-bottom: 1px solid #eee;
    }
    .ds-dash-hdr strong { font-size: 20px; font-weight: 700; letter-spacing: -0.2px; flex: 1; }
    .ds-dash-hdr .ds-hint { font-size: 13px; color: #777; }
    .ds-iconbtn-dark { color: #888; }
    .ds-iconbtn-dark:hover { background: #f0f0f0; }
    .ds-chips { display: flex; gap: 6px; padding: 12px 18px 0; }
    .ds-chip {
      border: 1px solid #ddd; background: #fff; border-radius: 999px;
      padding: 5px 12px; font-size: 12.5px; cursor: pointer; color: #444;
    }
    .ds-chip-on { background: #fc4c02; border-color: #fc4c02; color: #fff; font-weight: 600; }
    .ds-dash-body { padding: 14px 18px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .ds-cards { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .ds-stat { background: #f7f7f8; border-radius: 10px; padding: 10px 12px; }
    .ds-stat-val { font-size: 20px; font-weight: 700; }
    .ds-stat-label { font-size: 11.5px; color: #777; text-transform: uppercase; letter-spacing: .04em; }
    .ds-stat-delta { font-size: 11.5px; margin-top: 2px; }
    .ds-stat-delta.up { color: #157347; }
    .ds-stat-delta.down { color: #b02a37; }
    .ds-chart { background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 10px 12px; }
    .ds-chart-wide { grid-column: 1 / -1; }
    .ds-chart-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .ds-chart-head h3 { margin: 2px 0 8px; }
    .ds-mini-chips { display: flex; gap: 4px; }
    .ds-mini-chips .ds-chip { padding: 3px 9px; font-size: 11.5px; }
    .ds-chart h3 { margin: 2px 0 8px; font-size: 12.5px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
    .ds-chart svg { width: 100%; height: auto; display: block; }
    .ds-chart svg rect[fill]:not([fill="none"]) { cursor: pointer; }
    .ds-day { margin-top: 12px; border-top: 1px solid #eee; padding-top: 10px; display: flex; flex-direction: column; gap: 4px; }
    .ds-day h3 { font-size: 13px; margin: 0; text-transform: none; color: #333; }
    .ds-vol-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; color: #666; margin-top: 6px; }
    .ds-rolling-line { width: 16px; height: 0; border-top: 2px dashed #555; display: inline-block; }
    .ds-scale { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #888; margin-top: 6px; }
    .ds-scale-swatch { width: 11px; height: 11px; border-radius: 2.5px; display: inline-block; }
    .ds-donut { display: flex; align-items: center; gap: 12px; }
    .ds-donut svg { flex: none; width: 150px; }
    .ds-legend { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .ds-legend-row { display: flex; align-items: center; gap: 6px; }
    .ds-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
    .ds-top-row { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; border-bottom: 1px solid #f2f2f2; font-size: 13px; }
    .ds-top-row a { color: #136ffd; text-decoration: none; }
    .ds-top-row a:hover { text-decoration: underline; }
    .ds-top-sub { font-size: 12px; color: #666; padding-left: 14px; }
    .ds-top-sub.ds-due { color: #b02a37; font-weight: 700; }
    .ds-top-sub.ds-due-soon { color: #b45309; }
    .ds-fit-wrap { position: relative; }
    .ds-fit-tip {
      position: absolute; z-index: 5; background: #fff; border: 1px solid #ddd; border-radius: 8px;
      padding: 6px 9px; font-size: 12px; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,.12);
      pointer-events: none; white-space: nowrap;
    }
    .ds-fit-tip-date { font-weight: 600; margin-bottom: 2px; }
    .ds-share-card { margin-top: 10px; border-top: 1px solid #f2f2f2; padding-top: 10px; }
    .ds-share-card canvas { width: 100%; height: auto; display: block; border-radius: 10px; margin-top: 8px; }
    .ds-plan { grid-column: 1 / -1; }
    .ds-ai-card {
      border: 1px solid #fc4c02; border-radius: 8px; padding: 8px 10px; margin: 6px 0 10px;
      background: #fff7f3; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    .ds-ai-card strong { color: #fc4c02; font-size: 13px; }
    .ds-plan-picker { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .ds-plan-picker select, .ds-plan-picker input { padding: 7px 9px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; }
    .ds-plan .ds-table { margin-top: 10px; }
    .ds-cur-week { background: #fff4ed; }
    .ds-pill { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
    .ds-pill-done { background: #d1e7dd; color: #0a3622; }
    .ds-pill-partial { background: #fff3cd; color: #664d03; }
    .ds-pill-missed { background: #f8d7da; color: #58151c; }
    .ds-pill-future { background: #e9ecef; color: #495057; }
    .ds-adhere { display: flex; align-items: center; gap: 8px; margin: 8px 0; font-size: 12.5px; }
    .ds-adhere-bar { flex: 1; height: 8px; background: #ececec; border-radius: 999px; overflow: hidden; }
    .ds-adhere-fill { height: 100%; background: #157347; border-radius: 999px; }
    .ds-next { background: #f1f3f5; border-radius: 8px; padding: 9px 11px; margin: 8px 0; font-size: 13.5px; }
    .ds-footer { flex: none; padding: 8px 14px; font-size: 11px; color: #999; border-top: 1px solid #eee; }
  `;

  DS.PAGE_CSS = `
    .ds-dup-badge {
      display: inline-flex; align-items: center; justify-content: center;
      margin-left: 6px; padding: 1px 7px; border: none; border-radius: 999px;
      font: 700 11px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif;
      cursor: pointer; vertical-align: middle; color: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,.25);
    }
    .ds-dup-badge.ds-dup-del { background: #b02a37; }
    .ds-dup-badge.ds-dup-keep { background: #157347; }
    .ds-dup-badge:hover { filter: brightness(1.1); }
  `;
})();
