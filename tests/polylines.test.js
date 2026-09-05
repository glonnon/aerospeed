import { describe, expect, it } from 'vitest';
import '../src/content/polylines.js';

const DS = globalThis.DedupeStrava;

const SAME = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

describe('polylines.decode', () => {
  it('decodes the canonical example', () => {
    const pts = DS.polylines.decode('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeCloseTo(38.5, 5);
    expect(pts[0][1]).toBeCloseTo(-120.2, 5);
    expect(pts[2][0]).toBeCloseTo(43.252, 5);
    expect(pts[2][1]).toBeCloseTo(-126.453, 5);
  });
});

describe('polylines.similarity', () => {
  it('returns 1 for identical tracks', () => {
    expect(DS.polylines.similarity(SAME, SAME)).toBe(1);
  });

  it('scores a shifted copy high and a far-away track low', () => {
    const shifted = DS.polylines.decode(SAME).map(([la, ln]) => [la + 0.0001, ln + 0.0001]);
    const high = DS.polylines.similarity(SAME, encode(shifted));
    expect(high).toBeGreaterThan(0.75);

    const far = DS.polylines.decode(SAME).map(([la, ln]) => [la + 5, ln + 5]);
    const low = DS.polylines.similarity(SAME, encode(far));
    expect(low).toBeLessThan(0.3);
  });

  it('handles empty input', () => {
    expect(DS.polylines.similarity('', SAME)).toBe(0);
  });
});

function encode(points) {
  let px = 0;
  let py = 0;
  let out = '';
  for (const [la, ln] of points) {
    const nlat = Math.round(la * 1e5);
    const nlng = Math.round(ln * 1e5);
    out += enc(nlat - px) + enc(nlng - py);
    px = nlat;
    py = nlng;
  }
  return out;
}

function enc(v) {
  let x = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (x >= 0x20) {
    out += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
    x >>= 5;
  }
  out += String.fromCharCode(x + 63);
  return out;
}
