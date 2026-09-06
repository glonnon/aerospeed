(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  const SITES = {
    strava: {
      id: 'strava',
      name: 'Strava',
      activityUrl: (id) => `https://www.strava.com/activities/${id}`,
      linkIdRe: /\/activities\/(\d+)/,
      parseIdInput: (raw) => String(raw || '').replace(/\D/g, '')
    },
    intervals: {
      id: 'intervals',
      name: 'Intervals.icu',
      activityUrl: (id) => `https://intervals.icu/activities/${id}`,
      linkIdRe: /\/activities\/([\w-]+)/,
      parseIdInput: (raw) => String(raw || '').trim()
    }
  };

  const host = (typeof location !== 'undefined' && location.hostname) || '';
  DS.SITES = SITES;
  DS.site = host.endsWith('intervals.icu') ? SITES.intervals : SITES.strava;
})();
