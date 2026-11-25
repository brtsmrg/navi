import { describe, expect, it } from 'vitest';
import { buildGraph, type RoadWay } from './roam';
import { buildLoop } from './loop';
import { haversine, localToLngLat } from './geo';
import type { LngLat } from './types';

const O: LngLat = [-75.62, 45.52];
const at = (x: number, y: number): LngLat => localToLngLat(O, x, y);
const way = (id: string, pts: [number, number][], extra: Partial<RoadWay> = {}): RoadWay => ({ id, coords: pts.map(([x, y]) => at(x, y)), cls: 'tertiary', ...extra });

/** A square grid of straight roads, 500 m apart, 5 km each way. */
function grid(step = 500, size = 5000, cls: RoadWay['cls'] = 'tertiary'): RoadWay[] {
  const ws: RoadWay[] = [];
  for (let k = 0; k <= size; k += step) {
    const h: [number, number][] = [];
    const v: [number, number][] = [];
    for (let t = 0; t <= size; t += step) {
      h.push([t, k]);
      v.push([k, t]);
    }
    ws.push(way(`h${k}`, h, { cls }), way(`v${k}`, v, { cls }));
  }
  return ws;
}
const lenOf = (c: LngLat[]) => c.slice(1).reduce((s, p, i) => s + haversine(c[i], p), 0);

describe('fun loop', () => {
  it('returns a closed loop of about the asked length on a plain grid', () => {
    const g = buildGraph(grid());
    const r = buildLoop(g, at(2500, 2500), { lengthM: 12000 });
    expect(r).not.toBeNull();
    expect(r!.lengthM).toBeGreaterThan(7500);
    expect(r!.lengthM).toBeLessThan(18000);
    expect(haversine(r!.coords[0], r!.coords[r!.coords.length - 1])).toBeLessThan(30);
    expect(Math.abs(lenOf(r!.coords) - r!.lengthM) / r!.lengthM).toBeLessThan(0.02);
    expect(r!.repeat).toBeLessThan(0.35);
  });

  it('prefers winding roads when the grid offers them', () => {
    const plain = buildLoop(buildGraph(grid()), at(2500, 2500), { lengthM: 12000 })!;
    // the same grid, but the roads on the rim (1000 and 4000) wind; they cross the other roads at the same points
    const ws = grid().filter((w) => !['h1000', 'h4000', 'v1000', 'v4000'].includes(w.id));
    for (const k of [1000, 4000]) {
      const h: [number, number][] = [];
      const v: [number, number][] = [];
      for (let t = 0; t <= 5000; t += 50) {
        const wob = 70 * Math.sin((t / 500) * Math.PI * 4) * Math.sin((t / 250) * Math.PI);
        h.push([t, k + wob]);
        v.push([k + wob, t]);
      }
      ws.push(way(`h${k}`, h, { cls: 'secondary' }), way(`v${k}`, v, { cls: 'secondary' }));
    }
    const twisty = buildLoop(buildGraph(ws), at(2500, 2500), { lengthM: 12000 })!;
    expect(twisty).not.toBeNull();
    expect(twisty.degPerKm).toBeGreaterThan(plain.degPerKm + 15);
  });

  it('gives up cleanly when there is no road near', () => {
    const g = buildGraph(grid());
    expect(buildLoop(g, at(60000, 60000), { lengthM: 10000 })).toBeNull();
  });
});
