(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});
  const DAY = 86400000;

  const dayKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function dailyLoad(activities, days = 90) {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    const load = new Map();
    for (const a of activities || []) {
      const d = new Date(a.startDateLocal);
      const t = d.getTime();
      if (!Number.isFinite(t)) continue;
      const hours = (a.movingTimeS || 0) / 3600;
      if (!hours || hours <= 0) continue;
      const k = dayKey(d);
      load.set(k, (load.get(k) || 0) + hours);
    }
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({ date: d, load: load.get(dayKey(d)) || 0 });
    }
    return out;
  }

  function series(activities, { days = 90, ctlTau = 42, atlTau = 7 } = {}) {
    const loads = dailyLoad(activities, days);
    let ctl = 0;
    let atl = 0;
    const aC = 1 - Math.exp(-1 / ctlTau);
    const aA = 1 - Math.exp(-1 / atlTau);
    for (const p of loads) {
      ctl += (p.load - ctl) * aC;
      atl += (p.load - atl) * aA;
      p.ctl = ctl;
      p.atl = atl;
      p.tsb = ctl - atl;
    }
    return loads;
  }

  const round1 = (v) => Math.round(v * 10) / 10;

  function snapshot(activities, { days = 90 } = {}) {
    const s = series(activities, { days });
    if (!s.length) return null;
    const last = s[s.length - 1];
    return { ctl: round1(last.ctl), atl: round1(last.atl), tsb: round1(last.tsb) };
  }

  function chartSvg(pts) {
    const W = 860;
    const H = 210;
    const pad = { l: 48, r: 14, t: 16, b: 26 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const maxN = Math.max(1, ...pts.map((p) => Math.max(p.ctl, p.atl, p.load)));
    const maxT = Math.max(1, ...pts.map((p) => Math.abs(p.tsb)));
    const xOf = (i) => pad.l + (i * iw) / Math.max(1, pts.length - 1);
    const yN = (v) => pad.t + ih - (v / maxN) * ih;
    const mid = pad.t + ih / 2;
    const yT = (v) => mid - (v / maxT) * (ih / 2);

    let out = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    for (let g = 0; g <= 4; g++) {
      const y = pad.t + (ih * g) / 4;
      out += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" stroke="#efefef"/>`;
      out += `<text x="${pad.l - 6}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#999" text-anchor="end">${(maxN * (4 - g) / 4).toFixed(0)}</text>`;
    }
    out += `<line x1="${pad.l}" y1="${mid.toFixed(1)}" x2="${W - pad.r}" y2="${mid.toFixed(1)}" stroke="#e8e8e8" stroke-dasharray="3 3"/>`;
    const line = (arr, fn, stroke, dash) => {
      const ptsStr = arr.map((p, i) => `${xOf(i).toFixed(1)},${fn(p).toFixed(1)}`).join(' ');
      return `<polyline points="${ptsStr}" fill="none" stroke="${stroke}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
    };
    out += line(pts, (p) => yN(p.ctl), '#136ffd');
    out += line(pts, (p) => yN(p.atl), '#fc4c02');
    out += line(pts, (p) => yT(p.tsb), '#8a8f98', '4 3');
    for (let i = 0; i < pts.length; i++) {
      const m = pts[i].date.getMonth();
      const first = i === 0 || m !== pts[i - 1].date.getMonth();
      if (first && m % 2 === 0) {
        out += `<text x="${xOf(i).toFixed(1)}" y="${H - 8}" font-size="10" fill="#888" text-anchor="middle">${pts[i].date.toLocaleString([], { month: 'short' })}</text>`;
      }
    }
    out += '</svg>';
    return out;
  }

  DS.fitness = { dailyLoad, series, snapshot, chartSvg };
})();