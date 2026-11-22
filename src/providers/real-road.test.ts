import { describe, expect, it } from 'vitest';
import { generateStage } from '@/core';
import { parseRoute } from './valhalla';
import fixture from './fixtures/stelvio-prad-valhalla.json';

// A real Valhalla response (Prad to the Stelvio summit), saved so this runs offline.
// The route's shape has 3059 points (last maneuver begins at shape index 3058): a decode that
// returns any other count means the fixture or the polyline decoder is corrupt.
describe('real road: Stelvio Pass, Prad side (saved Valhalla response)', () => {
  const route = parseRoute(fixture as never);
  const stage = generateStage(route);

  it('decodes the whole shape and the router distance', () => {
    expect(route.coords.length).toBe(3059);
    expect(route.distance).toBeCloseTo(25324, -1);
    // first and last points are the requested ends (within snapping distance)
    expect(route.coords[0][1]).toBeCloseTo(46.6194, 2);
    expect(route.coords.at(-1)![0]).toBeCloseTo(10.4538, 2);
  });

  it('maps the real maneuver codes (right, sharp left, sharp right, left)', () => {
    const sides = (route.maneuvers ?? []).map((m) => `${m.side}:${m.sharpness}`);
    expect(sides).toEqual(['R:normal', 'R:normal', 'L:sharp', 'R:sharp', 'L:normal']);
  });

  it('finds a hairpin-dense, high-twist stage', () => {
    const s = stage.stats;
    console.log(JSON.stringify({ km: +(s.distanceM / 1000).toFixed(1), corners: s.cornerCount, hairpins: s.hairpins, bySeverity: s.bySeverity, twist: Math.round(s.twistScore), notes: s.noteCount }));
    expect(s.hairpins).toBeGreaterThanOrEqual(30);
    expect(s.twistScore).toBeGreaterThan(60);
  });

  it('keeps every note in order along the route', () => {
    const ss = stage.notes.map((n) => n.s);
    expect([...ss].sort((a, b) => a - b)).toEqual(ss);
  });
});
