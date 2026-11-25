import { buildGraph, buildLoop, generateStage, type RoadWay } from '@/core';
import type { LngLat } from '@/core/types';
import { cellsAround, fetchCell, fetchTile, tilesAround, TILE_DEG } from '@/providers/overpass';
import { getPackTile, tileOfPoint } from '@/providers/roadPack';
import { withHazards } from './hazardCalls';
import { useApp } from './store';

export interface LoopProgress {
  done: number;
  total: number;
}

/** Where the phone is right now, once. */
export function here(): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This device has no location sensor.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.longitude, p.coords.latitude]),
      (e) => reject(new Error(e.code === 1 ? 'Location is blocked. Allow it in your browser settings, then try again.' : 'Could not find where you are. Check the GPS signal and try again.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

/** Run at most `n` jobs at a time; a failed job does not stop the rest. */
async function pool<T>(jobs: (() => Promise<T>)[], n: number, onEach: (ok: boolean) => void): Promise<T[]> {
  const got: T[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        got.push(await job());
        onEach(true);
      } catch {
        onEach(false);
      }
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  return got;
}

/** Find the twistiest round trip of about `lengthM` that starts where the phone is, and open it like any route. */
export async function planFunLoop(lengthM: number, onProgress: (p: LoopProgress) => void, signal?: AbortSignal): Promise<void> {
  const start = await here();
  // the ring a loop is laid out on is about L / (pi * 1.4) wide and starts at the driver
  const reach = (lengthM / (Math.PI * 1.4)) * 1.05 + 500;
  const tiles = tilesAround(start, reach).filter((t) => {
    // keep the tiles that are actually inside the reach circle
    const cx = Math.min(Math.max(start[0], t.i * TILE_DEG), (t.i + 1) * TILE_DEG);
    const cy = Math.min(Math.max(start[1], t.j * TILE_DEG), (t.j + 1) * TILE_DEG);
    return Math.hypot((cx - start[0]) * 78000, (cy - start[1]) * 111000) <= reach;
  });
  // saved offline tiles are used first; only what is missing comes from the network
  const startTileSaved = !!(await getPackTile(tileOfPoint(start)));
  const closeTo = (w: RoadWay) => Math.hypot((w.coords[0][0] - start[0]) * 78000, (w.coords[0][1] - start[1]) * 111000) < 2500;
  const near = startTileSaved ? [] : cellsAround(start);
  const total = tiles.length + near.length;
  let done = 0;
  const tick = () => onProgress({ done: ++done, total });
  const nearWays = await pool(near.map((c) => () => fetchCell(c, signal)), 3, tick);
  if (signal?.aborted) return;
  if (near.length > 0 && !nearWays.length) throw new Error('Road data is not reachable right now. Check the signal and try again.');
  const nearIds = new Set(nearWays.flat().map((w) => w.id));
  const bigWays = await pool(
    tiles.map((t) => async () => {
      const saved = await getPackTile(t);
      // a saved tile has every street; keep the small ones only near the start, where the loop has to begin
      if (saved) return saved.filter((w) => w.cls !== 'minor' || nearIds.has(w.id) || closeTo(w));
      return fetchTile(t, signal);
    }),
    3,
    tick,
  );
  if (signal?.aborted) return;
  if (bigWays.length < Math.ceil(tiles.length * 0.6)) throw new Error('Could not read enough of the roads around you. Check the signal and try again.');
  const seen = new Set<string>();
  const ways: RoadWay[] = [];
  for (const list of [...nearWays, ...bigWays]) {
    for (const w of list) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      ways.push(w);
    }
  }
  const loop = buildLoop(buildGraph(ways), start, { lengthM });
  if (!loop) throw new Error('No good loop found from here. Try a different length, or drive to a spot with more roads around it.');
  const st = useApp.getState();
  st.setTripId(null);
  st.setFrom(null);
  st.setTo(null);
  st.setVia([]);
  st.setTab('explore');
  onProgress({ done: total, total });
  const base = generateStage({ coords: loop.coords });
  st.setStage(base);
  void withHazards(base).then((hz) => {
    if (hz !== base && useApp.getState().stage?.key === base.key) useApp.getState().setStage(hz);
  });
  st.setNotice(`Fun loop: ${(loop.lengthM / 1000).toFixed(1)} km, ${Math.round(loop.degPerKm)}° of bend per km, ${Math.round(loop.repeat * 100)}% repeated road.`);
}
