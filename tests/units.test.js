import { describe, expect, it } from 'vitest';
import '../src/content/units.js';

const DS = globalThis.DedupeStrava;

describe('units.dist', () => {
  it('formats metric km', () => {
    expect(DS.units.dist(12500)).toBe('12.5 km');
    expect(DS.units.dist(null)).toBe('—');
  });

  it('formats imperial miles', () => {
    expect(DS.units.dist(16093.44, 'imperial')).toBe('10.0 mi');
    expect(DS.units.dist(8046.72, 'imperial')).toBe('5.0 mi');
  });
});

describe('units.elev', () => {
  it('formats meters and feet', () => {
    expect(DS.units.elev(100)).toBe('100 m');
    expect(DS.units.elev(304.8, 'imperial')).toBe('1,000 ft');
  });
});

describe('units.kmTo', () => {
  it('converts km-based values for display', () => {
    expect(DS.units.kmTo(100)).toBe('100.0 km');
    expect(DS.units.kmTo(100, 'imperial')).toBe('62.1 mi');
  });
});

describe('units round-trip', () => {
  it('distNum/fromDistNum are inverse', () => {
    expect(DS.units.fromDistNum(DS.units.distNum(16093.44, 'imperial'), 'imperial')).toBeCloseTo(16093.44, 3);
  });
});