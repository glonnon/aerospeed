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

  const WEEK = 7 * 86400000;

  function weeklyLoads(activities, { weeks = 8, days = 0 } = {}) {
    const loads = dailyLoad(activities, days || weeks * 7 + 7);
    const now = new Date();
    const first = new Date(now);
    first.setHours(0, 0, 0, 0);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // current Monday
    const out = [];
    for (let i = 0; i < weeks; i++) {
      const start = new Date(first);
      start.setDate(first.getDate() - (weeks - 1 - i) * 7);
      const endMs = start.getTime() + WEEK;
      const load = loads
        .filter((p) => p.date.getTime() >= start.getTime() && p.date.getTime() < endMs)
        .reduce((s, p) => s + p.load, 0);
      out.push({ weekStart: start, load: Math.round(load * 10) / 10 });
    }
    return out;
  }

  function guardrails(activities, { days = 90 } = {}) {
    const loads = dailyLoad(activities, days);
    const n = loads.length;
    if (n < 14) return null;
    const sumBlocks = (fromEnd, len) => {
      const start = Math.max(0, n - fromEnd - len);
      const end = n - fromEnd;
      let t = 0;
      for (let i = start; i < end; i++) t += loads[i].load;
      return t;
    };
    const acute = sumBlocks(0, 7);
    const prevAcute = sumBlocks(7, 7);
    const chronic = sumBlocks(0, 28) / 4;
    const rampPct = prevAcute > 0 ? Math.round(((acute - prevAcute) / prevAcute) * 100) : null;
    const acwr = chronic > 0 ? Math.round((acute / chronic) * 10) / 10 : null;

    const s = series(activities, { days });
    const last = s[s.length - 1];
    const aWeekAgo = s[Math.max(0, s.length - 8)];
    const ctlDelta = last && aWeekAgo ? round1(last.ctl - aWeekAgo.ctl) : null;

    const flags = [];
    if (rampPct != null && rampPct > 15) flags.push('ramp');
    if (ctlDelta != null && ctlDelta > 8) flags.push('ctl');
    if (acwr != null && acwr > 1.5) flags.push('acwr-high');
    else if (acwr != null && acwr >= 1.3) flags.push('acwr-mid');
    else if (acwr != null && acwr < 0.8) flags.push('acwr-low');

    return { acute, prevAcute, chronic, rampPct, ctlDelta, acwr, flags };
  }

  function monotonyScore(activities, { days = 42 } = {}) {
    const loads = dailyLoad(activities, days).map((p) => p.load);
    if (!loads.length) return null;
    const active = loads.filter((l) => l > 0);
    const total = loads.reduce((t, l) => t + l, 0);
    if (total <= 0) return null;
    const mean = total / loads.length;
    const sd = Math.sqrt(loads.reduce((t, l) => t + (l - mean) ** 2, 0) / loads.length);
    const monotony = sd <= 0 ? 5 : mean / sd;
    const weeklySessions = active.length / Math.max(1, days / 7);
    const strain = monotony * (active.reduce((t, l) => t + l, 0) / Math.max(1, days / 7));
    return {
      monotony: Math.round(monotony * 10) / 10,
      strain: Math.round(strain * 10) / 10,
      activeDays: active.length,
      weeklySessions: Math.round(weeklySessions * 10) / 10,
      flags: monotony >= 2 ? ['monotony'] : monotony >= 1.5 ? ['monotony-mid'] : [],
      strainFlags: strain >= 350 ? ['strain-high'] : strain >= 250 ? ['strain-mid'] : []
    };
  }

  const CHART = { W: 860, H: 210, pad: { l: 48, r: 14, t: 16, b: 26 } };

  function chartSvg(pts) {
    const { W, H, pad } = CHART;
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
    out += `<line class="ds-fit-cursor" x1="-10" y1="${pad.t}" x2="-10" y2="${(pad.t + ih).toFixed(1)}" stroke="#bbb" stroke-width="1" visibility="hidden"/>`;
    out += `<rect class="ds-fit-overlay" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="none" pointer-events="all"/>`;
    out += '</svg>';
    return out;
  }

  DS.fitness = { dailyLoad, series, snapshot, chartSvg, CHART, weeklyLoads, guardrails, monotonyScore };
})();