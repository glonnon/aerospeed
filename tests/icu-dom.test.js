// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import '../src/content/ns.js';
import '../src/content/site.js';
import '../src/content/icu.js';

const DS = globalThis.DedupeStrava;

describe('icu.scrapeDom via scanAll (jsdom)', () => {
  it('seeds from rendered activity links and enriches with REST', async () => {
    document.body.innerHTML = `
      <div class="activity">
        <a class="activity-link clickable" href="/activities/i1001">Morning Ride</a>
        <time datetime="2026-09-05T07:30:00"></time>
      </div>
      <div class="activity">
        <a class="activity-link clickable" href="/activities/i1002">Evening Run</a>
        <time datetime="2026-09-04T17:00:00"></time>
      </div>`;
    let fetches = 0;
    const fetchImpl = async (url) => {
      fetches += 1;
      if (url.startsWith('/api/athlete?')) return { ok: true, status: 200, json: async () => ({ id: 'i31188' }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ list: [{ id: 'i1001', name: 'Morning Ride', type: 'Ride', start_date_local: '2026-09-05T07:30:00', distance: 40000, moving_time: 5400 }] })
      };
    };
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athletes',
      searchDateStart: '2026-09-01',
      searchDateEnd: '2026-09-06',
      delayMs: 0,
      retryDelayMs: 0,
      maxAttempts: 1
    });
    expect(fetches).toBeGreaterThan(0); // REST ran to enrich
    expect(out.strategy).toBe('icu-api');
    expect(out.activities.length).toBeGreaterThanOrEqual(2);
    expect(out.activities.some((a) => a.id === 'i1001')).toBe(true);
  });

  it('falls back to REST when the page has no activity rows yet', async () => {
    document.body.innerHTML = `<div class="empty">no activities</div>`;
    let fetches = 0;
    const fetchImpl = async (url) => {
      fetches += 1;
      if (url.startsWith('/api/athlete?')) return { ok: true, status: 200, json: async () => ({ id: 'i31188' }) };
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
      delayMs: 0,
      retryDelayMs: 0,
      maxAttempts: 1
    });
    expect(fetches).toBeGreaterThan(1);
    expect(out.strategy).toBe('icu-api');
    expect(out.activities).toHaveLength(1);
    expect(out.activities[0].id).toBe('i900');
  });

  it('parses distance and duration from rendered row text', async () => {
    document.body.innerHTML = `
      <div class="activity">
        <a class="activity-link clickable" href="/activities/i1001">Morning Loop</a>
        <span class="date">2026-09-05</span>
        <span class="dist">56.4&nbsp;km</span>
        <span class="time">2:14:30</span>
      </div>
      <div class="activity">
        <a class="activity-link clickable" href="/activities/i1002">Morning Loop</a>
        <span class="date">2026-09-05</span>
        <span class="dist">56.4 km</span>
        <span class="time">2:14:30</span>
      </div>`;
    const out = await DS.icu.scanAll({
      fetchImpl: async (url) => ({ ok: false, status: 403 }),
      pathname: '/athletes',
      searchDateStart: '2026-09-01',
      searchDateEnd: '2026-09-06',
      delayMs: 0,
      retryDelayMs: 0,
      maxAttempts: 1
    });
    expect(out.activities).toHaveLength(2);
    for (const a of out.activities) {
      expect(a.distanceM).toBeCloseTo(56400, 0);
      expect(a.movingTimeS).toBe(8070);
      expect(a.startDateLocal).toContain('2026-09-05');
    }
  });

  it('climbs past the name cell to read the sibling metric columns', async () => {
    document.body.innerHTML = `
      <div class="activity">
        <div class="name-cell"><a class="activity-link clickable" href="/activities/i201">Commute Loop</a></div>
        <span class="date">2026-09-02</span>
        <span class="sport">Ride</span>
        <span>41.2 km</span>
        <span>1:52:10</span>
      </div>
      <div class="activity">
        <div class="name-cell"><a class="activity-link clickable" href="/activities/i202">Commute Loop</a></div>
        <span class="date">2026-09-02</span>
        <span class="sport">Ride</span>
        <span>41.2 km</span>
        <span>1:52:10</span>
      </div>`;
    const out = await DS.icu.scanAll({
      fetchImpl: async () => ({ ok: false, status: 403 }),
      pathname: '/athletes',
      searchDateStart: '2026-09-01',
      searchDateEnd: '2026-09-06',
      delayMs: 0,
      retryDelayMs: 0,
      maxAttempts: 1
    });
    expect(out.activities).toHaveLength(2);
    const a = out.activities.find((x) => x.id === 'i201');
    expect(a.distanceM).toBeCloseTo(41200, 0);
    expect(a.movingTimeS).toBe(1 * 3600 + 52 * 60 + 10);
    expect(a.type).toBe('Ride');
  });

  it('parses a date cell with a clock time and does not confuse it with duration', async () => {
    document.body.innerHTML = `
      <div class="activity">
        <div class="name-cell"><a class="activity-link clickable" href="/activities/i301">Club Run</a></div>
        <span class="date">2026-09-03 07:30</span>
        <span>21.0 km</span>
        <span>1:04:10</span>
      </div>
      <div class="activity">
        <div class="name-cell"><a class="activity-link clickable" href="/activities/i302">Club Run</a></div>
        <span class="date">2026-09-03 07:32</span>
        <span>21.0 km</span>
        <span>1:04:10</span>
      </div>`;
    const out = await DS.icu.scanAll({
      fetchImpl: async () => ({ ok: false, status: 403 }),
      pathname: '/athletes',
      searchDateStart: '2026-09-01',
      searchDateEnd: '2026-09-06',
      delayMs: 0,
      retryDelayMs: 0,
      maxAttempts: 1
    });
    const a = out.activities.find((x) => x.id === 'i301');
    const b = out.activities.find((x) => x.id === 'i302');
    expect(a.startDateLocal).toContain('07:30');
    expect(b.startDateLocal).toContain('07:32');
    expect(a.movingTimeS).toBe(3850); // 1:04:10, not the clock time
  });

  it('retries until the WebSocket paints rows, then seeds from the DOM', async () => {
    document.body.innerHTML = `<div class="empty">loading…</div>`;
    const fetchImpl = async (url) => ({ ok: false, status: 403, json: async () => ({}) });
    const out = await DS.icu.scanAll({
      fetchImpl,
      pathname: '/athletes',
      searchDateStart: '2026-09-01',
      searchDateEnd: '2026-09-06',
      delayMs: 0,
      retryDelayMs: 0,
      maxAttempts: 3,
      onAttempt: (n) => {
        if (n === 2) {
          document.body.innerHTML = `<div class="activity"><a class="activity-link" href="/activities/i555">Arrived Ride</a><time datetime="2026-09-04T08:00:00"></time></div>`;
        }
      }
    });
    // First attempt: DOM empty + REST 403 -> retry. Second: DOM now has rows -> seed.
    expect(out.activities).toHaveLength(1);
    expect(out.activities[0].id).toBe('i555');
    expect(out.strategy).toBe('icu-dom');
  });
});