import { describe, expect, it } from 'vitest';
import { MAX_AREA_M, MIN_AREA_M, areaPolygon, areaTiles, clampSize, distanceM, estimate, fmtSize, sizeFromDrag, type Area } from './area';
import { TILE_DEG } from './overpass';

const C: [number, number] = [-75.7, 45.42];

describe('area size limits', () => {
  it('never allows more than 150 km across or less than 2 km', () => {
    expect(MAX_AREA_M).toBe(150_000);
    expect(clampSize(999_999)).toBe(150_000);
    expect(clampSize(10)).toBe(MIN_AREA_M);
    expect(clampSize(40_000)).toBe(40_000);
  });
  it('a drag far past the limit still gives 150 km', () => {
    expect(sizeFromDrag('circle', C, [C[0] + 5, C[1]])).toBe(150_000);
    expect(sizeFromDrag('square', C, [C[0] + 5, C[1] + 5])).toBe(150_000);
  });
  it('a circle drag of 10 km out is a 20 km circle', () => {
    const to: [number, number] = [C[0], C[1] + 10_000 / 110540];
    expect(sizeFromDrag('circle', C, to)).toBeCloseTo(20_000, -2);
  });
});

describe('area tiles', () => {
  const sq = (sizeM: number): Area => ({ kind: 'square', center: C, sizeM });
  const ci = (sizeM: number): Area => ({ kind: 'circle', center: C, sizeM });

  it('a tiny square is a handful of tiles', () => {
    expect(areaTiles(sq(2_000)).length).toBeLessThanOrEqual(4);
  });
  it('a circle has fewer tiles than the square around it, about pi/4 as many', () => {
    const s = areaTiles(sq(60_000)).length;
    const c = areaTiles(ci(60_000)).length;
    expect(c).toBeLessThan(s);
    expect(c / s).toBeGreaterThan(0.65);
    expect(c / s).toBeLessThan(0.9);
  });
  it('the biggest square stays inside a sane tile count and the centre tile is always included', () => {
    const t = areaTiles(sq(999_999));
    expect(t.length).toBeGreaterThan(900);
    expect(t.length).toBeLessThan(1400);
    expect(t).toContainEqual({ i: Math.floor(C[0] / TILE_DEG), j: Math.floor(C[1] / TILE_DEG) });
  });
  it('has no duplicate tiles', () => {
    const t = areaTiles(ci(80_000));
    expect(new Set(t.map((x) => `${x.i},${x.j}`)).size).toBe(t.length);
  });
});

describe('estimate and outline', () => {
  it('counts two requests per tile and a guess range that is ordered', () => {
    const e = estimate({ kind: 'square', center: C, sizeM: 30_000 });
    expect(e.requests).toBe(e.tiles * 2);
    expect(e.mbLow).toBeLessThan(e.mbHigh);
    expect(e.minutes).toBeGreaterThanOrEqual(1);
  });
  it('a square outline is closed with five points; a circle closes too', () => {
    const sq = areaPolygon({ kind: 'square', center: C, sizeM: 20_000 });
    expect(sq).toHaveLength(5);
    expect(sq[0]).toEqual(sq[4]);
    const ci = areaPolygon({ kind: 'circle', center: C, sizeM: 20_000 });
    expect(ci[0][0]).toBeCloseTo(ci[ci.length - 1][0], 9);
    // every point of the circle is about 10 km from the centre
    for (const p of ci) expect(distanceM(C, p)).toBeCloseTo(10_000, -2);
  });
  it('formats km and miles', () => {
    expect(fmtSize(150_000, 'metric')).toBe('150 km');
    expect(fmtSize(5_000, 'metric')).toBe('5.0 km');
    expect(fmtSize(160_934, 'imperial')).toBe('100 mi');
  });
});
