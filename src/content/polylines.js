(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  function decode(str) {
    let lat = 0;
    let lng = 0;
    let idx = 0;
    const out = [];
    while (idx < str.length) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        byte = str.charCodeAt(idx++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;
      shift = 0;
      result = 0;
      do {
        byte = str.charCodeAt(idx++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;
      out.push([lat / 1e5, lng / 1e5]);
    }
    return out;
  }

  const EARTH_R = 6371000;
  function haversine(a, b) {
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLng = ((b[1] - a[1]) * Math.PI) / 180;
    const la = (a[0] * Math.PI) / 180;
    const lb = (b[0] * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.sqrt(x));
  }

  function resample(points, n) {
    if (!points || points.length === 0) return [];
    if (points.length <= n) return points.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(points[Math.round((i * (points.length - 1)) / (n - 1))]);
    }
    return out;
  }

  function similarity(pa, pb, maxSamples = 64) {
    const a = decode(pa);
    const b = decode(pb);
    if (!a.length || !b.length) return 0;
    const n = Math.min(maxSamples, a.length, b.length);
    const ra = resample(a, n);
    const rb = resample(b, n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      total += Math.min(haversine(ra[i], rb[i]), haversine(ra[i], rb[n - 1 - i]));
    }
    return Math.max(0, 1 - total / n / 500);
  }

  DS.polylines = { decode, haversine, resample, similarity };
})();
