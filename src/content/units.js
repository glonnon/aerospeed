(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const MI = 1609.344;
  const FT = 0.3048;
  const MILE = 0.621371192;

  function isImperial(units) {
    return units === 'imperial';
  }

  function dist(m, units = 'metric', dec = 1) {
    if (m == null) return '—';
    return isImperial(units)
      ? `${(m / MI).toFixed(dec)} mi`
      : `${(m / 1000).toFixed(dec)} km`;
  }

  function distNum(m, units = 'metric') {
    if (m == null) return null;
    return isImperial(units) ? m / MI : m / 1000;
  }

  function fromDistNum(num, units = 'metric') {
    return isImperial(units) ? num * MI : num * 1000;
  }

  function elev(m, units = 'metric') {
    if (m == null) return '—';
    return isImperial(units)
      ? `${Math.round(m / FT).toLocaleString()} ft`
      : `${Math.round(m)} m`;
  }

  function kmTo(km, units = 'metric', dec = 1) {
    if (km == null) return '—';
    return isImperial(units)
      ? `${(km * MILE).toFixed(dec)} mi`
      : `${km.toFixed(dec)} km`;
  }

  DS.units = { isImperial, dist, distNum, fromDistNum, elev, kmTo };
})();