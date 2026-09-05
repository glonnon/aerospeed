(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const RELATED = {
    ride: ['virtualride', 'ebikeride'],
    virtualride: ['ride', 'ebikeride'],
    run: ['virtualrun', 'treadmillrun'],
    virtualrun: ['run', 'treadmillrun'],
    walk: ['hike'],
    hike: ['walk'],
    swim: ['openwater swim', 'lap swim']
  };

  const normType = (t) => (t ? String(t).toLowerCase().replace(/[\s_-]+/g, '') : null);

  function typesMatch(a, b, mode) {
    const ta = normType(a);
    const tb = normType(b);
    if (!ta || !tb) return false;
    if (ta === tb) return true;
    if (mode !== 'related') return false;
    return (RELATED[ta] || []).some((x) => normType(x) === tb);
  }

  function parseDate(s) {
    if (!s) return null;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }

  function timeProximity(tA, tB, settings) {
    const win = settings.timeWindowMinutes * 60000;
    const diffs = [Math.abs(tA - tB)];
    if (settings.checkDstShift) diffs.push(Math.abs(tA - tB - 3600000), Math.abs(tA - tB + 3600000));
    return diffs.some((d) => d <= win);
  }

  function pctDiff(a, b) {
    if (a == null || b == null) return null;
    const bigger = Math.max(Math.abs(a), Math.abs(b));
    if (bigger === 0) return 0;
    return (Math.abs(a - b) / bigger) * 100;
  }

  function overlapPct(sA, eA, sB, eB) {
    const start = Math.max(sA, sB);
    const end = Math.min(eA, eB);
    if (end <= start) return 0;
    const shorter = Math.min(eA - sA, eB - sB);
    if (shorter <= 0) return 0;
    return ((end - start) / shorter) * 100;
  }

  function pairCheck(a, b, settings) {
    const tA = parseDate(a.startDateLocal);
    const tB = parseDate(b.startDateLocal);
    if (tA == null || tB == null) return { match: false, reason: 'missing-time' };
    if (!typesMatch(a.type, b.type, settings.typeMatching)) return { match: false, reason: 'type' };
    if (!timeProximity(tA, tB, settings)) return { match: false, reason: 'time' };

    const dDiff = pctDiff(a.distanceM, b.distanceM);
    if (dDiff == null || dDiff > settings.distanceTolerancePct) {
      return { match: false, reason: 'distance', dDiff };
    }
    const tDiff = pctDiff(a.movingTimeS, b.movingTimeS);
    if (tDiff == null || tDiff > settings.durationTolerancePct) {
      return { match: false, reason: 'duration', tDiff };
    }

    const durA = a.movingTimeS || a.elapsedTimeS;
    const durB = b.movingTimeS || b.elapsedTimeS;
    if (!durA || !durB) return { match: false, reason: 'duration-missing' };

    const shifts = settings.checkDstShift ? [0, 3600000, -3600000] : [0];
    let ov = 0;
    for (const s of shifts) {
      ov = Math.max(ov, overlapPct(tA, tA + durA * 1000, tB + s, tB + s + durB * 1000));
    }
    if (ov < settings.minOverlapPct) return { match: false, reason: 'overlap', ov };

    let routeSim = null;
    if (a.polyline && b.polyline) {
      routeSim = DS.polylines.similarity(a.polyline, b.polyline);
      if (routeSim < settings.polylineThreshold) {
        return { match: false, reason: 'route', routeSim };
      }
    }

    return { match: true, dDiff, tDiff, ov, routeSim };
  }

  function maxWindowMs(settings) {
    let w = settings.timeWindowMinutes * 60000;
    if (settings.checkDstShift) w += 3600000;
    return w;
  }

  function findCandidates(activities, settings) {
    const sorted = [...activities].sort(
      (x, y) => (parseDate(x.startDateLocal) ?? Infinity) - (parseDate(y.startDateLocal) ?? Infinity)
    );
    const window = maxWindowMs(settings);
    const pairs = [];
    for (let i = 0; i < sorted.length; i++) {
      const tI = parseDate(sorted[i].startDateLocal);
      if (tI == null) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        const tJ = parseDate(sorted[j].startDateLocal);
        if (tJ == null) continue;
        if (tJ - tI > window) break;
        const check = pairCheck(sorted[i], sorted[j], settings);
        if (check.match) pairs.push({ a: sorted[i], b: sorted[j], check });
      }
    }
    return pairs;
  }

  const speedOf = (a) => (a.distanceM && a.movingTimeS ? a.distanceM / a.movingTimeS : null);

  function relativeBonus(member, group) {
    let bonus = 0;
    for (const o of group) {
      if (o === member) continue;
      if ((member.distanceM ?? -1) > (o.distanceM ?? -1)) bonus += 2;
      if ((member.movingTimeS ?? -1) > (o.movingTimeS ?? -1)) bonus += 2;
      if ((member.elevationM ?? -1) > (o.elevationM ?? -1)) bonus += 3;
      const sA = speedOf(member);
      const sB = speedOf(o);
      if (sA != null && sB != null && sA > sB) bonus += 2;
      if ((member.achievementCount ?? 0) > (o.achievementCount ?? 0)) bonus += 2;
      if ((member.kudosCount ?? 0) + (member.commentCount ?? 0) > (o.kudosCount ?? 0) + (o.commentCount ?? 0)) bonus += 1;
    }
    return bonus;
  }

  function findGroups(activities, settings) {
    const pairs = findCandidates(activities, settings);
    const parent = new Map();
    const find = (x) => {
      if (!parent.has(x)) parent.set(x, x);
      while (parent.get(x) !== x) x = parent.get(x);
      return x;
    };
    const union = (x, y) => {
      parent.set(find(x), find(y));
    };
    const ids = new Set(pairs.flatMap((p) => [p.a.id, p.b.id]));
    for (const id of ids) find(id);
    for (const p of pairs) union(p.a.id, p.b.id);

    const members = new Map();
    for (const act of activities) {
      if (!ids.has(act.id)) continue;
      const root = find(act.id);
      if (!members.has(root)) members.set(root, []);
      members.get(root).push(act);
    }

    return [...members.values()].map((group) => {
      const scored = group
        .map((a) => ({
          act: a,
          score: DS.quality.score(a, settings),
          relBonus: relativeBonus(a, group)
        }))
        .sort((x, y) => y.score.total + y.relBonus - (x.score.total + x.relBonus));
      const uncertain =
        scored.length > 1 && scored[0].score.total + scored[0].relBonus - (scored[1].score.total + scored[1].relBonus) < 3;
      return {
        keep: scored[0].act,
        remove: scored.slice(1).map((s) => s.act),
        scores: scored,
        uncertain,
        checks: pairs.filter((p) => group.includes(p.a) || group.includes(p.b)).map((p) => p.check)
      };
    });
  }

  DS.dedupe = { pairCheck, findCandidates, findGroups, typesMatch, pctDiff, overlapPct, relativeBonus, RELATED };
})();
