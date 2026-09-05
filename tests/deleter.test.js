// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import '../src/content/deleter.js';

const DS = globalThis.DedupeStrava;

describe('deleter.deleteActivity', () => {
  it('posts the Rails method-override delete with CSRF token', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url: String(url), opts });
      return { ok: true, status: 200, url: 'https://www.strava.com/athlete/training' };
    };
    const r = await DS.deleter.deleteActivity('123', { fetchImpl, csrf: 'TOKEN' });

    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe('https://www.strava.com/activities/123');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.body).toContain('_method=delete');
    expect(calls[0].opts.body).toContain('authenticity_token=TOKEN');
  });

  it('fails when the redirect does not land on the training page', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, url: 'https://www.strava.com/activities/123' });
    const r = await DS.deleter.deleteActivity('123', { fetchImpl, csrf: 'T' });
    expect(r.ok).toBe(false);
  });

  it('fails without a CSRF token', async () => {
    const r = await DS.deleter.deleteActivity('123', { fetchImpl: async () => ({}), csrf: null });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('missing-csrf');
  });
});

describe('deleter.deletion log', () => {
  it('records successful deletions in storage.local', async () => {
    const saved = {};
    DS.ext = {
      storage: {
        local: {
          get: async (k) => ({ [k]: saved[k] }),
          set: async (obj) => Object.assign(saved, obj)
        }
      }
    };
    const fetchImpl = async () => ({ ok: true, status: 200, url: 'https://www.strava.com/athlete/training' });
    await DS.deleter.deleteMany(['77', '78'], { fetchImpl, csrf: 'T', delayMs: 0 });
    expect(saved.dedupeLog.map((e) => e.id)).toEqual(['78', '77']);
    DS.ext = undefined;
  });
});

describe('deleter.deleteMany', () => {
  it('runs sequentially with delays and reports progress', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, url: 'https://www.strava.com/athlete/training' });
    const progress = [];
    const results = await DS.deleter.deleteMany(['1', '2', '3'], {
      fetchImpl,
      csrf: 'T',
      delayMs: 0,
      onProgress: (p) => progress.push(p.done)
    });
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(progress).toEqual([1, 2, 3]);
  });

  it('stops when abort is signaled', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, url: 'https://www.strava.com/athlete/training' });
    let n = 0;
    const results = await DS.deleter.deleteMany(['1', '2', '3'], {
      fetchImpl,
      csrf: 'T',
      delayMs: 0,
      shouldAbort: () => ++n > 2
    });
    expect(results).toHaveLength(2);
  });
});
