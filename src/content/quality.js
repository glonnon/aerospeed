(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  function deviceRank(deviceName, settings) {
    const name = String(deviceName || '').toLowerCase();
    if (!name) return -1;
    const ranking = settings.deviceRanking || [];
    const idx = ranking.findIndex((brand) => name.includes(brand));
    if (idx === -1) return 1;
    return Math.max(0, ranking.length - idx);
  }

  function score(a, settings) {
    const b = { hr: 0, power: 0, gps: 0, cadence: 0, device: 0, elevation: 0, achievements: 0, social: 0, manual: 0 };
    if (a.hasHr) b.hr = 10;
    if (a.hasPower) b.power = 10;
    if (a.polyline || a.hasGps) b.gps = 8;
    if (a.hasCadence) b.cadence = 5;

    const rank = deviceRank(a.deviceName, settings);
    if (rank > 0) b.device = Math.min(5, rank);
    else if (rank === 0) b.device = 5;

    b.elevation = a.elevationM > 0 ? 3 : 0;
    b.achievements = Math.min(6, (a.prCount || a.achievementCount || 0) * 2);
    b.social = Math.min(4, (a.kudosCount || 0) + (a.commentCount || 0) + (a.photoCount || 0) * 2);
    if (a.manual) b.manual = -10;

    const total = Object.values(b).reduce((s, v) => s + v, 0);
    return { total, breakdown: b };
  }

  DS.quality = { score, deviceRank };
})();
