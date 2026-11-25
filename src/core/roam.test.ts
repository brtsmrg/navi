import { describe, expect, it } from 'vitest';
import { buildGraph, followRoad, type RoadWay } from './roam';
import { generateStage } from './index';
import { haversine, localToLngLat } from './geo';
import { openTestStage } from './synth';
import type { LngLat } from './types';

const O: LngLat = [-75.62, 45.52];
const at = (x: number, y: number): LngLat => localToLngLat(O, x, y);
const way = (id: string, pts: [number, number][], extra: Partial<RoadWay> = {}): RoadWay => ({
  id,
  coords: pts.map(([x, y]) => at(x, y)),
  cls: 'secondary',
  ...extra,
});
/** east-pointing road along y = 0 from x = 0 to 3000, with the junction at x = 1000 */
const lineEast = (x0: number, x1: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1; x += 100) pts.push([x, 0]);
  return pts;
};
const lenOf = (c: LngLat[]) => c.slice(1).reduce((s, p, i) => s + haversine(c[i], p), 0);
const endOf = (c: LngLat[]): [number, number] => {
  const p = c[c.length - 1];
  return [(p[0] - O[0]) * 111320 * Math.cos((O[1] * Math.PI) / 180), (p[1] - O[1]) * 110540];
};

describe('free roam: follow the road ahead', () => {
  it('goes straight past a side road', () => {
    const g = buildGraph([
      way('main', lineEast(0, 3000), { ref: 'A1' }),
      way('side', [[1000, 0], [1000, 200], [1000, 600]], { cls: 'minor', name: 'Elm St' }),
    ]);
    const r = followRoad(g, at(100, 2), 90, { lengthM: 1500 });
    expect(r).not.toBeNull();
    expect(lenOf(r!.coords)).toBeGreaterThan(1450);
    const [ex, ey] = endOf(r!.coords);
    expect(ex).toBeGreaterThan(1500);
    expect(Math.abs(ey)).toBeLessThan(5);
    expect(r!.junctions.length).toBe(1);
  });

  it('stays on the numbered road at a fork even when the other branch is straighter', () => {
    const g = buildGraph([
      way('in', lineEast(0, 1000), { ref: 'D7' }),
      // D7 bends 22 degrees left; the unnamed service-like branch carries on dead straight
      way('d7', [[1000, 0], [1500, 200], [2200, 450]], { ref: 'D7' }),
      way('rat', [[1000, 0], [1500, 0], [2200, 0]], { cls: 'minor', name: 'Chemin du Bois' }),
    ]);
    const r = followRoad(g, at(300, 0), 90, { lengthM: 1500 });
    const [, ey] = endOf(r!.coords);
    expect(ey).toBeGreaterThan(100); // went up the D7 branch
  });

  it('follows the straighter road when both are the same class and neither is the same road', () => {
    const g = buildGraph([
      way('in', lineEast(0, 1000), { name: 'In' }),
      way('left', [[1000, 0], [1400, 400], [1800, 800]], { name: 'Left' }),
      way('straight', [[1000, 0], [1500, 20], [2200, 40]], { name: 'Straight' }),
    ]);
    const r = followRoad(g, at(300, 0), 90, { lengthM: 1500 });
    const [, ey] = endOf(r!.coords);
    expect(ey).toBeLessThan(80);
  });

  it('lets the driver pick a branch at the first junction (game mode)', () => {
    const base: RoadWay[] = [
      way('in', lineEast(0, 1000), { name: 'Main' }),
      way('out', [[1000, 0], [1700, 0], [2400, 0]], { name: 'Main' }),
      way('left', [[1000, 0], [1000, 400], [1000, 1200]], { name: 'North Rd' }),
      way('right', [[1000, 0], [1000, -400], [1000, -1200]], { name: 'South Rd' }),
    ];
    const g = buildGraph(base);
    const straight = followRoad(g, at(300, 0), 90, { lengthM: 1500, firstJunctionBias: 0 })!;
    const left = followRoad(g, at(300, 0), 90, { lengthM: 1500, firstJunctionBias: 1 })!;
    const right = followRoad(g, at(300, 0), 90, { lengthM: 1500, firstJunctionBias: -1 })!;
    expect(endOf(straight.coords)[0]).toBeGreaterThan(1900);
    expect(endOf(left.coords)[1]).toBeGreaterThan(500);
    expect(endOf(right.coords)[1]).toBeLessThan(-500);
  });

  it('does not drive the wrong way along a one-way road', () => {
    const g = buildGraph([way('one', lineEast(0, 2000), { oneway: 'yes' })]);
    expect(followRoad(g, at(500, 1), 270, { lengthM: 800 })).toBeNull(); // heading west on an east-only road
    expect(followRoad(g, at(500, 1), 90, { lengthM: 800 })).not.toBeNull();
  });

  it('still finds the road when the heading is not known yet', () => {
    const g = buildGraph([way('m', lineEast(0, 2000))]);
    const r = followRoad(g, at(500, 3), NaN, { lengthM: 600 });
    expect(r).not.toBeNull();
    expect(r!.offsetM).toBeLessThan(5);
  });

  it('ends at a dead end and says nothing when the car is nowhere near a road', () => {
    const g = buildGraph([way('m', lineEast(0, 800))]);
    const r = followRoad(g, at(300, 0), 90, { lengthM: 3000 })!;
    expect(lenOf(r.coords)).toBeLessThan(560);
    expect(followRoad(g, at(300, 400), 90, { lengthM: 500 })).toBeNull();
  });

  it('turns the road ahead into pacenotes like a planned route', () => {
    const test = openTestStage().coords;
    const ways: RoadWay[] = [{ id: 't', coords: test, cls: 'secondary', name: 'Open test road' }];
    const g = buildGraph(ways);
    const start = test[0];
    const r = followRoad(g, start, NaN, { lengthM: 2500 })!;
    expect(r.coords.length).toBeGreaterThan(20);
    const st = generateStage({ coords: r.coords });
    expect(st.notes.filter((n) => n.kind === 'corner').length).toBeGreaterThanOrEqual(4);
  });
});
