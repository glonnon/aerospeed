(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const PLANS = [
    {
      id: 'marathon',
      name: 'Marathon block (12 weeks)',
      sport: 'run',
      weeks: 12,
      longKm: [12, 14, 16, 18, 20, 16, 24, 26, 28, 32, 18, 42.2],
      hoursMult: [1, 1.1, 1.2, 1.3, 1.35, 1.1, 1.4, 1.45, 1.5, 1.55, 1.1, 0.9],
      intensity: [1, 1, 2, 2, 2, 1, 2, 2, 2, 3, 1, 1],
      tips: [
        'Long runs are the backbone — keep them conversational.',
        'Add strides to the end of easy runs.',
        'Tempo week: 30 min at threshold feels harder than it looks.',
        'Practice marathon-pace miles inside the long run.',
        'Fuel the long run the way you will race day.',
        'Recovery week — let the training absorb.',
        'Back-to-back long-ish runs teach tired legs.',
        'Longest build: test your full race-day ritual.',
        'Quality over quantity. Keep the taper echoes out of easy days.',
        'Peak long run — this carries you to the line.',
        'Taper. Short + sharp. Trust the block.',
        'Race week: nothing new — shoes, gels, socks, rhythm.'
      ]
    },
    {
      id: 'ftp',
      name: 'FTP builder (8 weeks)',
      sport: 'ride',
      weeks: 8,
      longKm: [40, 50, 60, 50, 80, 90, 60, 40],
      hoursMult: [1, 1.1, 1.2, 1.1, 1.3, 1.35, 1.1, 0.8],
      intensity: [3, 3, 3, 2, 4, 4, 2, 1],
      tips: [
        'Sweet-spot intervals: 3×15 min @ 88-93% FTP.',
        'Threshold work: 2×20 min @ 100% FTP, 10 min easy.',
        'Over/unders teach your engine to ride hard and recover.',
        'Easy week — aerobic base underpins the gains.',
        'Biggest week: 4 sessions. Sleep and fuel hard.',
        'Re-test FTP this week before the final build.',
        'Freshen up with shorter, punchier efforts.',
        'Test week: 20-minute FTP test on a flat, familiar loop.'
      ]
    },
    {
      id: 'century',
      name: 'First 100-mile ride (10 weeks)',
      sport: 'ride',
      weeks: 10,
      longKm: [50, 65, 75, 85, 95, 105, 115, 125, 135, 160],
      hoursMult: [1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.4, 1.3, 1.2, 0.9],
      intensity: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      tips: [
        'Build your base — keep easy rides truly easy.',
        'Start practicing eating on the bike: 40–60 g carbs/hour.',
        'Back-to-back weekend rides teach your legs to ride tired.',
        'Time to practice your race nutrition on every long ride.',
        'Big week — pace by effort, not speed.',
        'Peak volume. Sleep and fuel like it is your job.',
        'Last big long ride. Test everything you will use on race day.',
        'Taper begins — shorten rides, keep a little intensity.',
        'Freshen up. Short spins with a few strides.',
        'Race week. 100 miles is a fueling problem, not a fitness problem.'
      ]
    },
    {
      id: 'vo2',
      name: 'VO2max boost block (8 weeks)',
      sport: 'any',
      weeks: 8,
      longKm: null,
      hoursMult: [1, 1.05, 1.1, 1.1, 1.15, 1.1, 1, 0.8],
      intensity: [2, 2, 2, 2, 2, 2, 1, 1],
      tips: [
        'VO2 sessions: 5×3 min hard / 3 min easy at “can’t speak” effort.',
        'Keep volume flat — the intensity is the stimulus.',
        'Alternate: 5×3 min VO2 one day, 2×15 min threshold another.',
        'If legs are flat, swap intensity for endurance. Consistency beats heroics.',
        'Peak block. Expect the hard sessions to feel genuinely hard.',
        'Consolidate. Same work, look for it feeling easier.',
        'Reduce to one intensity session.',
        'Taper. Race the fitness you built in a local event or test.'
      ]
    },
    {
      id: 'him703',
      name: 'Half-Ironman 70.3 (12 weeks)',
      sport: 'ride',
      weeks: 12,
      longKm: [55, 65, 75, 85, 90, 95, 75, 100, 105, 110, 80, 90],
      runLongKm: [8, 10, 12, 12, 14, 14, 10, 16, 16, 18, 12, 21.1],
      hoursMult: [1, 1.1, 1.2, 1.25, 1.3, 1.35, 1.1, 1.4, 1.45, 1.5, 1.1, 0.9],
      intensity: [1, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 1],
      tips: [
        'Two swims, two bikes, two runs + one rest day as a skeleton.',
        'Add a brick: short run straight off the long bike.',
        'Practice race-pace efforts inside long sessions.',
        'Fueling rehearsal starts now: 60–90 g carbs/hour on the bike.',
        'Long rides get race-specific: target pace, full nutrition.',
        'Biggest week. Watch for niggles early — back off, not through.',
        'Recovery week. Let the adaptation land.',
        'Peak block one. Bricks are non-negotiable now.',
        'Peak block two. Open-water or race-simulation swim if you can.',
        'Longest week — this is the fitness that carries the day.',
        'Taper. Trim volume, keep sharpness.',
        'Race week. Nothing new: not the bike, not the gels, not the shoes.'
      ]
    }
  ];

  const MONDAY = (d) => {
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return dt;
  };

  const median = (arr) => {
    const a = [...arr].filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };

  function baselines(activities, startDate) {
    const start = new Date(startDate).getTime();
    const groups = { ride: [], run: [], swim: [], other: [] };
    const preHours = [];
    const cutoff = start - 28 * 86400000;
    for (const a of activities || []) {
      const d = new Date(a.startDateLocal);
      if (!Number.isFinite(d.getTime())) continue;
      const g = DS.viz.sportGroup(a.type);
      const kmh = a.distanceM && a.movingTimeS ? a.distanceM / 1000 / (a.movingTimeS / 3600) : null;
      if (kmh != null && d.getTime() < start) groups[g].push(kmh);
      const t = d.getTime();
      if (t >= cutoff && t < start) preHours.push((a.movingTimeS || 0) / 3600);
    }
    const byGroup = {};
    for (const g of Object.keys(groups)) byGroup[g] = median(groups[g]);
    const weeklyHours = preHours.length
      ? (preHours.reduce((s, h) => s + h, 0) / 28) * 7
      : null;
    return { speedMedian: byGroup, weeklyHours };
  }

  function isIntensity(a, base) {
    if (/interval|vo2|thresh|tempo|\brace\b|hard|hill repeats/i.test(a.name || '')) return true;
    const g = DS.viz.sportGroup(a.type);
    const m = base?.speedMedian?.[g];
    if (!m || !a.distanceM || !a.movingTimeS) return false;
    const kmh = a.distanceM / 1000 / (a.movingTimeS / 3600);
    return kmh >= m * 1.25;
  }

  function planWeeks(plan, startDate) {
    const first = MONDAY(new Date(startDate));
    const out = [];
    for (let i = 0; i < plan.weeks; i++) {
      const s = new Date(first);
      s.setDate(first.getDate() + i * 7);
      const e = new Date(s);
      e.setDate(s.getDate() + 7);
      out.push({ index: i, start: s, end: e });
    }
    return out;
  }

  function weekActual(week, activities, base, plan) {
    const from = week.start.getTime();
    const to = week.end.getTime();
    const actual = { hours: 0, longKm: 0, runLongKm: 0, intensity: 0, sessions: 0 };
    for (const a of activities || []) {
      const d = new Date(a.startDateLocal);
      if (!Number.isFinite(d.getTime())) continue;
      const t = d.getTime();
      if (t < from || t >= to) continue;
      actual.sessions += 1;
      actual.hours += (a.movingTimeS || 0) / 3600;
      const g = DS.viz.sportGroup(a.type);
      const km = (a.distanceM || 0) / 1000;
      if (plan.sport === 'any' || g === plan.sport) actual.longKm = Math.max(actual.longKm, km);
      if (g === 'run') actual.runLongKm = Math.max(actual.runLongKm, km);
      if (isIntensity(a, base)) actual.intensity += 1;
    }
    return actual;
  }

  function statusOf(planned, actual, targetHours) {
    let need = 0;
    let met = 0;
    if (targetHours > 0) {
      need += 1;
      if (actual.hours >= targetHours * 0.8) met += 1;
    }
    if (planned.longKm) {
      need += 1;
      if (actual.longKm >= planned.longKm * 0.9) met += 1;
    }
    if (planned.runLongKm) {
      need += 1;
      if (actual.runLongKm >= planned.runLongKm * 0.9) met += 1;
    }
    if (planned.intensity > 0) {
      need += 1;
      if (actual.intensity >= planned.intensity) met += 1;
    }
    if (need === 0) return 'idle';
    if (met === need) return 'done';
    if (met > 0) return 'partial';
    return 'missed';
  }

  function assess(plan, startDate, activities, now = Date.now()) {
    const base = baselines(activities, startDate);
    const weeks = planWeeks(plan, startDate);
    const rows = weeks.map((w) => {
      const planned = {
        longKm: plan.longKm ? plan.longKm[w.index] : null,
        runLongKm: plan.runLongKm ? plan.runLongKm[w.index] : null,
        intensity: plan.intensity[w.index]
      };
      const targetHours =
        base.weeklyHours != null ? Math.round(base.weeklyHours * plan.hoursMult[w.index] * 10) / 10 : null;
      const actual = weekActual(w, activities, base, plan);
      const inFuture = w.start.getTime() > now;
      return {
        ...w,
        planned,
        targetHours,
        actual,
        status: inFuture ? 'future' : statusOf(planned, actual, targetHours ?? 0)
      };
    });

    const current = rows.find((r) => now >= r.start.getTime() && now < r.end.getTime()) ||
      (now < rows[0].start.getTime() ? rows[0] : rows[rows.length - 1]);
    const past = rows.filter((r) => r.status !== 'future' && r.targetHours != null);
    const adherence = past.length
      ? Math.round((past.filter((r) => r.status === 'done').length / past.length) * 100)
      : null;
    const raceInDays = Math.max(
      0,
      Math.ceil((weeks[weeks.length - 1].end.getTime() - now) / 86400000)
    );
    return {
      plan,
      base,
      weeks: rows,
      current,
      adherence,
      raceInDays,
      nextWorkout: nextWorkout(plan, current, base)
    };
  }

  function nextWorkout(plan, weekRow, base) {
    if (!weekRow) return null;
    const p = weekRow.planned;
    const a = weekRow.actual;
    const sportName = plan.sport === 'any' ? 'ride or run' : plan.sport;
    if (p.intensity > 0 && a.intensity < p.intensity) {
      const remaining = p.intensity - a.intensity;
      return {
        kind: 'intensity',
        text: `${remaining} × ${sportName} intensity session — e.g. ${plan.sport === 'run' ? '6×2 min hard / 2 min jog' : '5×3 min hard / 3 min easy'}, plus warmup/cooldown`
      };
    }
    if (p.longKm && a.longKm < p.longKm * 0.9) {
      return { kind: 'long', text: `Long ${plan.sport}: ${p.longKm} km at easy, conversational pace` };
    }
    if (p.runLongKm && a.runLongKm < p.runLongKm * 0.9) {
      return { kind: 'long-run', text: `Long run: ${p.runLongKm} km easy pace` };
    }
    if (weekRow.targetHours != null && a.hours < weekRow.targetHours * 0.8) {
      const left = Math.max(0.5, Math.round((weekRow.targetHours - a.hours) * 10) / 10);
      return { kind: 'endurance', text: `Endurance: ~${left} h easy volume still open this week` };
    }
    return { kind: 'done', text: 'Week complete — rest or easy spin, and let the fitness land.' };
  }

  function validateGeneratedPlan(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not an object'] };
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'AI Training Plan';
    const weeks = Number(raw.weeks);
    if (!Number.isInteger(weeks) || weeks < 4 || weeks > 13) errors.push(`weeks must be an integer 4..13, got ${raw.weeks}`);
    const sport = ['ride', 'run', 'any'].includes(raw.sport) ? raw.sport : 'any';
    const arr = (v) => (Array.isArray(v) ? v : []);
    const numArr = (v, lo, hi) => arr(v).map((x) => Math.min(hi, Math.max(lo, Number(x) || 0)));
    const pad = (a, n) => (a.length >= n ? a.slice(0, n) : [...a, ...Array(n - a.length).fill(a[a.length - 1] ?? 0)]);
    const longKm = pad(numArr(raw.longKm, 0, 600), weeks);
    const hoursMult = pad(numArr(raw.hoursMult, 0.3, 3), weeks);
    const intensity = pad(numArr(raw.intensity, 0, 6).map((v) => Math.round(v)), weeks);
    const tips = arr(raw.tips).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 160));
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      plan: { id: 'llm', name, sport, weeks, longKm, hoursMult, intensity, tips, llm: true }
    };
  }

  function buildTrainingSummary(activities, { weeks = 10 } = {}) {
    const lines = [];
    const sums = { count: 0, km: 0, hours: 0 };
    const bySport = {};
    const byWeek = [];
    const now = new Date();
    const first = MONDAY(now);
    first.setDate(first.getDate() - (weeks - 1) * 7);
    for (let i = 0; i < weeks; i++) {
      const w = new Date(first);
      w.setDate(first.getDate() + i * 7);
      byWeek.push({ start: w, count: 0, km: 0, hours: 0 });
    }
    for (const a of activities || []) {
      const d = new Date(a.startDateLocal);
      if (!Number.isFinite(d.getTime())) continue;
      sums.count += 1;
      const km = (a.distanceM || 0) / 1000;
      const h = (a.movingTimeS || 0) / 3600;
      sums.km += km;
      sums.hours += h;
      const g = sportGroupOf(a.type);
      bySport[g] = bySport[g] || { count: 0, km: 0, hours: 0 };
      const s = bySport[g];
      s.count += 1;
      s.km += km;
      s.hours += h;
      const t = d.getTime();
      for (const w of byWeek) {
        const ws = w.start.getTime();
        if (t >= ws && t < ws + 7 * 86400000) {
          w.count += 1;
          w.km += km;
          w.hours += h;
          break;
        }
      }
    }
    lines.push(`Athlete has ${sums.count} activities loaded (${weeks}-week window shown).`);
    lines.push(`Total: ${Math.round(sums.km)} km, ${Math.round(sums.hours * 10) / 10} h moving time.`);
    const sports = Object.entries(bySport).map(
      ([g, v]) => `${g}: ${v.count} acts, ${Math.round(v.km)} km, ${Math.round(v.hours * 10) / 10} h`
    );
    if (sports.length) lines.push(sports.join('; '));
    lines.push('Weekly (newest first): ' + [...byWeek].reverse().map((w) => `${Math.round(w.km)}km/${Math.round(w.hours * 10) / 10}h`).join(', '));
    return lines.join('\n');
  }

  function sportGroupOf(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('ride') || t.includes('bike')) return 'ride';
    if (t.includes('run') || t.includes('walk') || t.includes('hike')) return 'run';
    if (t.includes('swim')) return 'swim';
    return 'other';
  }

  function applyAdjustments(plan, adj) {
    if (!plan) return null;
    const next = { ...plan, longKm: [...plan.longKm], hoursMult: [...plan.hoursMult], intensity: [...plan.intensity] };
    const set = (key, val) => {
      if (!Array.isArray(val) || !val.length) return;
      for (let i = 0; i < next.weeks; i++) {
        if (i >= next.weeks) break;
        const v = Number(val[i]);
        if (Number.isFinite(v)) {
          next[key][i] = key === 'intensity' ? Math.round(Math.min(6, Math.max(0, v))) : Math.min(key === 'longKm' ? 600 : 3, Math.max(key === 'hoursMult' ? 0.3 : 0, v));
        }
      }
    };
    set('longKm', adj.longKm);
    set('hoursMult', adj.hoursMult);
    set('intensity', adj.intensity);
    if (Array.isArray(adj.tips) && adj.tips.length) next.tips = adj.tips.map((t) => String(t).slice(0, 160));
    return next;
  }

  DS.plans = { PLANS, baselines, isIntensity, planWeeks, weekActual, assess, nextWorkout, statusOf, validateGeneratedPlan, buildTrainingSummary, applyAdjustments };
})();
