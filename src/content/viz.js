(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const COLORS = { ride: '#fc4c02', run: '#2f6df6', swim: '#00a5c4', other: '#9aa0a6' };

  function sportGroup(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('ride') || t.includes('bike')) return 'ride';
    if (t.includes('run') || t.includes('walk') || t.includes('hike')) return 'run';
    if (t.includes('swim')) return 'swim';
    return 'other';
  }

  const GROUPS = ['ride', 'run', 'swim', 'other'];

  function parseDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function weekStart(d) {
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return dt;
  }

  function prepared(activities, filter) {
    const out = [];
    for (const a of activities || []) {
      if (filter && filter !== 'all' && sportGroup(a.type) !== filter) continue;
      const d = parseDate(a.startDateLocal);
      out.push({ a, d });
    }
    return out;
  }

  function summary(activities, filter) {
    const s = { count: 0, distanceKm: 0, timeH: 0, elevationM: 0 };
    for (const { a } of prepared(activities, filter)) {
      s.count += 1;
      s.distanceKm += (a.distanceM || 0) / 1000;
      s.timeH += (a.movingTimeS || 0) / 3600;
      s.elevationM += a.elevationM || 0;
    }
    s.distanceKm = Math.round(s.distanceKm);
    s.elevationM = Math.round(s.elevationM);
    s.timeH = Math.round(s.timeH * 10) / 10;
    return s;
  }

  function weeklySeries(activities, { weeks = 12, filter = 'all' } = {}) {
    const buckets = new Map();
    const now = new Date();
    const first = weekStart(now);
    first.setDate(first.getDate() - (weeks - 1) * 7);
    for (let i = 0; i < weeks; i++) {
      const w = new Date(first);
      w.setDate(first.getDate() + i * 7);
      buckets.set(dayKey(w), { key: dayKey(w), label: w, Ride: 0, Run: 0, Swim: 0, Other: 0, timeH: 0, count: 0 });
    }
    for (const { a, d } of prepared(activities, filter)) {
      const k = dayKey(weekStart(d));
      const b = buckets.get(k);
      if (!b) continue;
      const g = sportGroup(a.type);
      const label = g.charAt(0).toUpperCase() + g.slice(1);
      b[label] += (a.distanceM || 0) / 1000;
      b.timeH += (a.movingTimeS || 0) / 3600;
      b.count += 1;
    }
    return [...buckets.values()];
  }

  function calendarCells(activities, { days = 182, filter = 'all' } = {}) {
    const byDay = new Map();
    for (const { a, d } of prepared(activities, filter)) {
      const k = dayKey(d);
      const entry = byDay.get(k) || { hours: 0, acts: [] };
      entry.hours += (a.movingTimeS || 0) / 3600;
      entry.acts.push({
        id: a.id,
        name: a.name,
        type: a.type,
        distanceM: a.distanceM,
        movingTimeS: a.movingTimeS,
        url: (DS.site?.activityUrl || ((id) => `https://www.strava.com/activities/${id}`))(a.id)
      });
      byDay.set(k, entry);
    }
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    const lead = (start.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push({ blank: true });
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const entry = byDay.get(dayKey(d));
      const h = entry ? entry.hours : 0;
      cells.push({ date: d, hours: h, level: 0 });
    }
    const active = cells
      .filter((c) => !c.blank && c.hours > 0)
      .map((c) => c.hours)
      .sort((x, y) => x - y);
    const q = (p) => (active.length ? active[Math.min(active.length - 1, Math.floor(p * active.length))] : Infinity);
    const floors = [0.25, 0.5, 1, 2];
    const qs = [q(0.4), q(0.65), q(0.85), q(0.97)];
    const thresholds = floors.map((f, i) => Math.max(f, qs[i]));
    for (const c of cells) {
      if (c.blank || c.hours <= 0) continue;
      c.level = 1 + thresholds.filter((t) => c.hours >= t).length;
    }
    const daysObj = {};
    for (const [k, entry] of byDay) daysObj[k] = entry.acts;
    return { cells, cols: Math.ceil(cells.length / 7), thresholds, days: daysObj };
  }

  function sportShares(activities, filter = 'all') {
    const totals = { ride: 0, run: 0, swim: 0, other: 0 };
    let sum = 0;
    for (const { a } of prepared(activities, null)) {
      const g = sportGroup(a.type);
      if (filter !== 'all' && g !== filter) continue;
      const t = (a.movingTimeS || 0) / 3600;
      totals[g] += t;
      sum += t;
    }
    return GROUPS.map((g) => ({ group: g, label: g[0].toUpperCase() + g.slice(1), hours: Math.round(totals[g] * 10) / 10, pct: sum > 0 ? Math.floor((totals[g] / sum) * 100) : 0 }));
  }

  function topActivities(activities, { n = 5, withinDays = 0, filter = 'all' } = {}) {
    const cutoff = withinDays ? Date.now() - withinDays * 86400000 : 0;
    return prepared(activities, filter)
      .filter(({ a, d }) => d && (!cutoff || d.getTime() >= cutoff) && (a.distanceM || 0) > 0)
      .sort((x, y) => (y.a.distanceM || 0) - (x.a.distanceM || 0))
      .slice(0, n);
  }

  function esc(s) {
    return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  }

  const CAL_SHADES = ['#ececef', '#ffe0d1', '#ffb699', '#ff8247', '#f4501e'];

  function weeklyBarsSvg(series, units = 'metric') {
    const W = 860;
    const H = 210;
    const pad = { l: 48, r: 12, t: 18, b: 26 };
    const SCALE = units === 'imperial' ? 0.621371192 : 1;
    const max = Math.max(10, ...series.map((b) => (b.Ride + b.Run + b.Swim + b.Other) * SCALE));
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const bw = iw / Math.max(1, series.length);
    const barW = Math.max(3, Math.round(bw * 0.68));
    const xOf = (i) => pad.l + i * bw + (bw - barW) / 2;
    const dec = max >= 100 ? 0 : 1;

    let out = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    out += `<text x="${pad.l - 40}" y="11" font-size="10" fill="#888" font-weight="600">${units === 'imperial' ? 'mi' : 'km'}</text>`;
    for (let g = 0; g <= 4; g++) {
      const y = pad.t + (ih * g) / 4;
      out += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" stroke="${g === 0 ? '#ddd' : '#efefef'}"/>`;
      out += `<text x="${pad.l - 6}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#999" text-anchor="end">${((max * (4 - g)) / 4).toFixed(dec)}</text>`;
    }

    series.forEach((b, i) => {
      let y = pad.t + ih;
      const total = (b.Ride + b.Run + b.Swim + b.Other) * SCALE;
      const breakdown = ['Ride', 'Run', 'Swim', 'Other'].map((s) => `${s} ${(b[s] * SCALE).toFixed(1)}`).join(' · ');
      for (const seg of ['Ride', 'Run', 'Swim', 'Other']) {
        const h = (b[seg] * SCALE) / max * ih;
        if (h <= 0.3) continue;
        y -= h;
        out += `<rect x="${xOf(i).toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="1.5" fill="${COLORS[seg.toLowerCase()]}"><title>${dayKey(b.label)} — ${breakdown} (total ${total.toFixed(1)} ${units === 'imperial' ? 'mi' : 'km'})</title></rect>`;
      }
      const m = b.label.getMonth();
      const firstOfMonth = i === 0 || m !== series[i - 1].label.getMonth();
      const fits = bw > 26 || m % 2 === (series[0].label.getMonth() % 2);
      if (firstOfMonth && fits) {
        out += `<text x="${(xOf(i) + barW / 2).toFixed(1)}" y="${H - 8}" font-size="10" fill="#888" text-anchor="middle">${esc(b.label.toLocaleString([], { month: 'short' }))}</text>`;
      }
    });

    const pts = [];
    for (let i = 0; i < series.length; i++) {
      const win = series.slice(Math.max(0, i - 3), i + 1);
      const avg = (win.reduce((s, b) => s + b.Ride + b.Run + b.Swim + b.Other, 0) / win.length) * SCALE;
      pts.push(`${(xOf(i) + barW / 2).toFixed(1)},${(pad.t + ih - (avg / max) * ih).toFixed(1)}`);
    }
    out += `<polyline points="${pts.join(' ')}" fill="none" stroke="#555" stroke-width="1.6" stroke-dasharray="5 3" opacity="0.85"><title>4-week rolling average</title></polyline>`;
    out += '</svg>';
    return out;
  }

  function calendarSvg(cal) {
    const { cells, cols } = cal;
    const cell = 13;
    const gap = 3;
    const left = 30;
    const top = 18;
    const W = left + cols * (cell + gap) + 4;
    const H = top + 7 * (cell + gap) + 6;
    let out = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    for (let c = 0; c < cols; c++) {
      const idx = c * 7;
      const first = cells[idx];
      if (!first || first.blank) continue;
      if (first.date.getDate() <= 7) {
        out += `<text x="${left + c * (cell + gap)}" y="11" font-size="10" fill="#888">${esc(first.date.toLocaleString([], { month: 'short' }))}</text>`;
      }
    }
    for (const [row, label] of [[0, 'M'], [2, 'W'], [4, 'F']]) {
      out += `<text x="${left - 6}" y="${top + row * (cell + gap) + cell - 2}" font-size="9" fill="#aaa" text-anchor="end">${label}</text>`;
    }
    cells.forEach((c, i) => {
      if (c.blank) return;
      const x = left + Math.floor(i / 7) * (cell + gap);
      const y = top + (i % 7) * (cell + gap);
      out += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${CAL_SHADES[c.level]}"><title>${dayKey(c.date)} — ${c.hours.toFixed(1)} h</title></rect>`;
    });
    out += '</svg>';
    return out;
  }

  function donutSvg(shares) {
    const size = 150;
    const r = 55;
    const cx = size / 2;
    const cy = size / 2;
    const C = 2 * Math.PI * r;
    let offset = 0;
    let out = `<svg viewBox="0 0 ${size} ${size}" role="img">`;
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ececec" stroke-width="18"/>`;
    for (const s of shares) {
      if (s.pct <= 0) continue;
      const len = (s.pct / 100) * C;
      out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COLORS[s.group]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"><title>${s.label}: ${s.pct}% (${s.hours} h)</title></circle>`;
      offset += len;
    }
    out += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" font-weight="600" fill="#444">${Math.round(shares.reduce((t, s) => t + s.hours, 0) * 10) / 10} h</text>`;
    out += '</svg>';
    return out;
  }

  function fitRange(spanDays) {
    const days = Math.max(1, Math.ceil(spanDays || 0));
    return {
      weeks: Math.min(52, Math.max(4, Math.ceil(days / 7))),
      calDays: Math.min(182, Math.max(28, days))
    };
  }

  function gearSummary(activities, { filter = 'all' } = {}) {
    const map = new Map();
    for (const { a, d } of prepared(activities, filter)) {
      if (!a.gearId) continue;
      const g = map.get(String(a.gearId)) || { gearId: String(a.gearId), count: 0, distM: 0, timeS: 0, elevM: 0, last: null };
      g.count += 1;
      g.distM += a.distanceM || 0;
      g.timeS += a.movingTimeS || 0;
      g.elevM += a.elevationM || 0;
      if (d && (g.last == null || d.getTime() > g.last.getTime())) g.last = d;
      map.set(String(a.gearId), g);
    }
    return [...map.values()].sort((x, y) => y.distM - x.distM);
  }

  function yearSummaries(activities, { filter = 'all' } = {}) {
    const years = new Map();
    for (const { a, d } of prepared(activities, filter)) {
      if (!d) continue;
      const y = d.getFullYear();
      const entry = years.get(y) || { year: y, count: 0, distKm: 0, timeH: 0, elevM: 0 };
      entry.count += 1;
      entry.distKm += (a.distanceM || 0) / 1000;
      entry.timeH += (a.movingTimeS || 0) / 3600;
      entry.elevM += a.elevationM || 0;
      years.set(y, entry);
    }
    return [...years.values()].sort((x, y) => y.year - x.year);
  }

  function streaks(activities, { days = 90, filter = 'all' } = {}) {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    const active = new Set();
    for (const { a, d } of prepared(activities, filter)) {
      if (!d) continue;
      const t = d.getTime();
      if (t < start.getTime() || t > end.getTime() + 86399999) continue;
      active.add(dayKey(d));
    }
    const seq = [];
    for (let i = 0; i < days; i++) {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      seq.push(active.has(dayKey(dd)));
    }
    let current = 0;
    for (let i = seq.length - 1; i >= 0 && seq[i]; i--) current++;
    let longest = 0;
    let run = 0;
    let longestGap = 0;
    let runGap = 0;
    for (const b of seq) {
      run = b ? run + 1 : 0;
      runGap = b ? 0 : runGap + 1;
      longest = Math.max(longest, run);
      longestGap = Math.max(longestGap, runGap);
    }
    return {
      current,
      longest,
      longestGap,
      activeDays: active.size,
      days,
      consistencyPct: Math.round((active.size / days) * 100)
    };
  }

  function qualityFlags(activities, { filter = 'all', n = 30 } = {}) {
    const issues = [];
    for (const { a, d } of prepared(activities, filter)) {
      if (!d) continue;
      const flags = [];
      const detail = [];
      const dist = a.distanceM || 0;
      const timeS = a.movingTimeS || 0;
      if (dist > 1000 && timeS > 0) {
        const kph = dist / timeS * 3.6;
        if (kph > 60) {
          flags.push('speed-high');
          detail.push(`avg ${Math.round(kph)} km/h`);
        } else if (kph < 2.5 && dist > 5000) {
          flags.push('speed-low');
          detail.push(`avg ${Math.round(kph * 10) / 10} km/h`);
        }
      }
      if (a.hasHr && a.averageHr && (a.averageHr > 200 || a.averageHr < 30)) {
        flags.push('hr-weird');
        detail.push(`HR ${a.averageHr}`);
      }
      if (dist > 0 && !a.hasGps && !a.polyline) {
        flags.push('no-gps');
        detail.push('no GPS');
      }
      if (dist > 1500 && a.polyline && DS.polylines?.decode) {
        try {
          const pts = DS.polylines.decode(a.polyline);
          const pathLen = pts.reduce((t, p, i) => (i === 0 ? t : t + DS.polylines.haversine(pts[i - 1], p)), 0);
          const ratio = pathLen / dist;
          if (pts.length < 10 || ratio < 0.55) {
            flags.push('truncated');
            detail.push(`GPS path ${Math.round(ratio * 100)}% of recorded distance`);
          }
        } catch (e) {
          /* unreadable polyline — ignore */
        }
      }
      if (flags.length) issues.push({ a, d, flags, detail });
      if (issues.length >= n) break;
    }
    return [...issues].sort((x, y) => y.flags.length - x.flags.length);
  }

  function heatmap(activities, { days = 120, filter = 'all' } = {}) {
    const MATRIX = Array.from({ length: 7 }, () => Array(24).fill(0));
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    for (const { a, d } of prepared(activities, filter)) {
      if (!d || (cutoff && d.getTime() < cutoff)) continue;
      const day = (d.getDay() + 6) % 7; // Monday-based
      const hour = d.getHours();
      MATRIX[day][hour] += (a.movingTimeS || 0) / 3600;
    }
    let max = 0;
    for (const row of MATRIX) for (const v of row) max = Math.max(max, v);
    return { matrix: MATRIX, max, total: MATRIX.flat().reduce((t, v) => t + v, 0) };
  }

  function monthlyTrends(activities, { filter = 'all', months = 8 } = {}) {
    const map = new Map();
    const now = new Date();
    for (const { a, d } of prepared(activities, filter)) {
      if (!d) continue;
      const bucket = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const t = map.get(bucket) || { key: bucket, d: new Date(d.getFullYear(), d.getMonth(), 1), rides: 0, hours: 0, hr: null, watts: null };
      t.rides += 1;
      t.hours += (a.movingTimeS || 0) / 3600;
      const hr = a.averageHr || a.hasHrAvg;
      const w = a.averageWatts;
      if (hr) t.hr = t.hr == null ? hr : Math.max(t.hr, hr);
      if (w) t.watts = t.watts == null ? w : Math.max(t.watts, w);
      map.set(bucket, t);
    }
    const out = [...map.values()].sort((x, y) => y.key.localeCompare(x.key)).slice(0, months).reverse();
    const anyHr = out.some((m) => m.hr != null);
    const anyW = out.some((m) => m.watts != null);
    return { months: out, anyHr, anyW };
  }

  function racePredictor(activities, { distanceKm = 40, filter = 'all' } = {}) {
    // Use the best recent average speed over the haul, with a fatigue taper
    // exponent and a CTL/TSB correction like classic race predictors.
    const recents = prepared(activities, filter).filter(({ a, d }) => d && a.movingTimeS && a.distanceM > 3000);
    if (!recents.length) return null;
    const cutoff = Date.now() - 90 * 86400000;
    const haul = recents.filter(({ d }) => d.getTime() >= cutoff);
    const pool = haul.length ? haul : recents;
    let bestKph = 0;
    let best = null;
    for (const { a } of pool) {
      const kph = a.distanceM / a.movingTimeS * 3.6;
      if (kph > bestKph) {
        bestKph = kph;
        best = a;
      }
    }
    if (!best) return null;
    const flatKph = best.distanceM / best.movingTimeS * 3.6;
    const refKm = best.distanceM / 1000;
    const expo = -0.07; // pace decays slowly with distance
    const predKph = flatKph * Math.pow(Math.min(1, refKm / distanceKm), -expo);
    const ctl = (DS.fitness?.snapshot(activities)?.ctl) ?? 30;
    const form = (DS.fitness?.snapshot(activities)?.tsb) ?? 0;
    const adjust = Math.min(1.08, Math.max(0.9, 1 + (ctl - 30) / 300 + form / 200));
    return {
      distanceKm,
      predictedHms: (distanceKm / (predKph * adjust)) * 3600,
      bestKph: Math.round(bestKph * 10) / 10,
      refKm: Math.round(refKm),
      ctl,
      form
    };
  }

  function shareStats(activities, { filter = 'all' } = {}) {
    const years = yearSummaries(activities, { filter });
    const thisYear = years.find((y) => y.year === new Date().getFullYear());
    const s = summary(activities, filter);
    return {
      count: thisYear?.count ?? 0,
      distKm: Math.round(thisYear?.distKm ?? 0),
      timeH: Math.round(thisYear?.timeH ?? 0),
      elevM: Math.round(thisYear?.elevM ?? 0),
      bestStreak: streaks(activities, { days: 365, filter }).longest,
      totalCount: s.count,
      totalDistKm: Math.round(s.distanceKm)
    };
  }

  DS.viz = {
    sportGroup,
    weeklySeries,
    calendarCells,
    sportShares,
    summary,
    topActivities,
    fitRange,
    dayKey,
    gearSummary,
    yearSummaries,
    streaks,
    qualityFlags,
    heatmap,
    monthlyTrends,
    racePredictor,
    shareStats,
    weeklyBarsSvg,
    calendarSvg,
    donutSvg,
    CAL_SHADES,
    COLORS,
    GROUPS
  };
})();
