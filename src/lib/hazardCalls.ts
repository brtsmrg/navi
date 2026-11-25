import { addHazards, type Stage } from '@/core';
import type { Cell } from '@/providers/overpass';
import { TILE_DEG } from '@/providers/overpass';
import { hazardsFor } from '@/providers/roadPack';
import { useApp } from './store';

const MAX_TILES = 60;

/** The map tiles a route passes through, in order of first use. */
export function tilesOnRoute(coords: [number, number][]): Cell[] {
  const seen = new Set<string>();
  const out: Cell[] = [];
  const add = (lng: number, lat: number) => {
    const c = { i: Math.floor(lng / TILE_DEG), j: Math.floor(lat / TILE_DEG) };
    const k = `${c.i}:${c.j}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  };
  let prev: [number, number] | null = null;
  for (const p of coords) {
    // walk long segments in small steps so no tile in between is missed
    if (prev) {
      const steps = Math.ceil(Math.hypot((p[0] - prev[0]) / TILE_DEG, (p[1] - prev[1]) / TILE_DEG) * 3);
      for (let k = 1; k < steps; k++) add(prev[0] + ((p[0] - prev[0]) * k) / steps, prev[1] + ((p[1] - prev[1]) * k) / steps);
    }
    add(p[0], p[1]);
    prev = p;
  }
  return out;
}

/** The stage with bump, rail crossing, camera and narrowing calls added. Returns it unchanged when the driver turned this off or the map points cannot be read. */
export async function withHazards(stage: Stage, signal?: AbortSignal): Promise<Stage> {
  if (!useApp.getState().settings.hazards) return stage;
  const tiles = tilesOnRoute(stage.route.coords as [number, number][]);
  if (tiles.length === 0 || tiles.length > MAX_TILES) return stage;
  const lists: Awaited<ReturnType<typeof hazardsFor>>[] = [];
  let next = 0;
  const worker = async () => {
    while (next < tiles.length && !signal?.aborted) lists.push(await hazardsFor(tiles[next++], signal));
  };
  await Promise.all([worker(), worker(), worker()]);
  if (signal?.aborted) return stage;
  return addHazards(stage, lists.flat());
}
