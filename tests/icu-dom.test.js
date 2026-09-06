// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import '../src/content/ns.js';
import '../src/content/site.js';
import '../src/content/icu.js';

const DS = globalThis.DedupeStrava;

describe('icu.scrapeDom via scanAll (jsdom)', () => {
  it('seeds from rendered activity links and skips the REST feed', async () => {
    document.body.innerHTML = `
      <div class="activity">
        <a class="activity-link clickable" href="/activities/i1001">Morning Ride</a>
        <time datetime="2026-09-05T07:30:00"></time>
      </div>
      <div class="activity">
        <a class="activity-link clickable" href="/activities/i1002">Evening Run</a>
        <time datetime="2026-09-04T17:00:00"></time>
      </div>`;
    let fetched = 0;
    const fetchImpl = async (url) => {
      fetched += 1;
      return url.startsWith('/api/')
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({}) };
    };
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athletes',
      searchDateStart: '2026-09-01',
      searchDateEnd: '2026-09-06',
      delayMs: 0
    });
    expect(fetched).toBe(0); // DOM seeded → REST never called
    expect(out.strategy).toBe('icu-dom');
    expect(out.activities).toHaveLength(2);
    expect(out.activities[0].id).toBe('i1001');
    expect(out.activities[0].name).toBe('Morning Ride');
    expect(out.activities[0].startDateLocal).toBe('2026-09-05T07:30:00');
    expect(out.activities[0].type).toBe('Ride');
    expect(out.activities[1].startDateLocal).toBe('2026-09-04T17:00:00');
  });

  it('falls back to REST when the page has no activity rows yet', async () => {
    document.body.innerHTML = `<div class="empty">no activities</div>`;
    let fetches = 0;
    const fetchImpl = async (url) => {
      fetches += 1;
      if (url === '/api/athlete') return { ok: true, status: 200, json: async () => ({ id: 'i31188' }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ list: [{ id: 'i900', name: 'Later Ride', type: 'Ride', start_date_local: '2026-09-03T10:00:00', distance: 20000, moving_time: 3600 }] })
      };
    };
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athletes',
      searchDateStart: '2026-09-01',
      searchDateEnd: '2026-09-06',
      delayMs: 0
    });
    expect(fetches).toBeGreaterThan(1);
    expect(out.strategy).toBe('icu-api');
    expect(out.activities).toHaveLength(1);
    expect(out.activities[0].id).toBe('i900');
  });
});