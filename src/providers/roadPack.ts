import type { LngLat } from '@/core/types';
import type { RoadWay } from '@/core/roam';
import type { Hazard } from '@/core/hazards';
import { HIGHWAYS, TILE_DEG, fetchHazardTile, fetchRaw, tilesAround, type Cell } from './overpass';

/**
 * Offline roads: map tiles (about 5 km by 4 km, every drivable road) kept on the phone in IndexedDB,
 * so Free roam and Fun loop work with no signal. A pack is read from the public OpenStreetMap servers
 * once, politely (two at a time, with a pause), and never leaves the phone. Nothing about the driver is sent.
 */
const DB = 'navi-roads';
const STORE = 'tiles';
const HZ = 'hazards';

interface Saved {
  json: string;
  ways: number;
  bytes: number;
  at: number;
}

export const packKey = (c: Cell) => `${c.i}:${c.j}`;
export const tileOfPoint = (p: LngLat): Cell => ({ i: Math.floor(p[0] / TILE_DEG), j: Math.floor(p[1] / TILE_DEG) });
/** The big tile a small 0.01 square sits in. */
export const tileOfCell = (c: Cell): Cell => ({ i: Math.floor((c.i * 0.01) / TILE_DEG + 1e-9), j: Math.floor((c.j * 0.01) / TILE_DEG + 1e-9) });

let dbp: Promise<IDBDatabase | null> | undefined;
function db(): Promise<IDBDatabase | null> {
  return (dbp ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const names = r.result.objectStoreNames;
      if (!names.contains(STORE)) r.result.createObjectStore(STORE);
      if (!names.contains(HZ)) r.result.createObjectStore(HZ);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  }));
}

function packQuery(c: Cell): string {
  const s = (c.j * TILE_DEG).toFixed(5);
  const w = (c.i * TILE_DEG).toFixed(5);
  const n = ((c.j + 1) * TILE_DEG).toFixed(5);
  const e = ((c.i + 1) * TILE_DEG).toFixed(5);
  return `[out:json][timeout:90];way["highway"~"^(${HIGHWAYS})$"]["access"!~"^(private|no)$"](${s},${w},${n},${e});out geom;`;
}

async function getSaved(c: Cell): Promise<Saved | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    const q = d.transaction(STORE).objectStore(STORE).get(packKey(c));
    q.onsuccess = () => resolve(q.result as Saved | undefined);
    q.onerror = () => resolve(undefined);
  });
}

/** The saved roads of one tile, or undefined when that tile was never downloaded. */
export async function getPackTile(c: Cell): Promise<RoadWay[] | undefined> {
  const v = await getSaved(c);
  if (!v) return undefined;
  try {
    const ways = JSON.parse(v.json) as RoadWay[];
    return Array.isArray(ways) ? ways : undefined;
  } catch {
    return undefined;
  }
}

async function putSaved(c: Cell, ways: RoadWay[]): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  const json = JSON.stringify(ways);
  const v: Saved = { json, ways: ways.length, bytes: json.length, at: Date.now() };
  return new Promise((resolve) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(v, packKey(c));
    t.oncomplete = () => resolve(true);
    t.onerror = () => resolve(false);
    t.onabort = () => resolve(false);
  });
}

/** Saved hazard points of one tile, or undefined when never saved. */
export async function getPackHazards(c: Cell): Promise<Hazard[] | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    const q = d.transaction(HZ).objectStore(HZ).get(packKey(c));
    q.onsuccess = () => resolve(Array.isArray(q.result) ? (q.result as Hazard[]) : undefined);
    q.onerror = () => resolve(undefined);
  });
}

async function putHazards(c: Cell, list: Hazard[]): Promise<void> {
  const d = await db();
  if (!d) return;
  await new Promise<void>((resolve) => {
    const t = d.transaction(HZ, 'readwrite');
    t.objectStore(HZ).put(list, packKey(c));
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
}

/** Hazards for a tile: saved copy first, then the network. A failure just means no hazard calls there. */
export async function hazardsFor(c: Cell, signal?: AbortSignal): Promise<Hazard[]> {
  const saved = await getPackHazards(c);
  if (saved) return saved;
  try {
    return await fetchHazardTile(c, signal);
  } catch {
    return [];
  }
}

export interface PackInfo {
  tiles: number;
  ways: number;
  bytes: number;
}

export async function packInfo(): Promise<PackInfo> {
  const d = await db();
  const none = { tiles: 0, ways: 0, bytes: 0 };
  if (!d) return none;
  return new Promise((resolve) => {
    const info = { ...none };
    const q = d.transaction(STORE).objectStore(STORE).openCursor();
    q.onsuccess = () => {
      const cur = q.result;
      if (!cur) return resolve(info);
      const v = cur.value as Saved;
      info.tiles++;
      info.ways += v.ways;
      info.bytes += v.bytes;
      cur.continue();
    };
    q.onerror = () => resolve(info);
  });
}

export async function clearPack(): Promise<void> {
  const d = await db();
  if (!d) return;
  await new Promise<void>((resolve) => {
    const t = d.transaction([STORE, HZ], 'readwrite');
    t.objectStore(STORE).clear();
    t.objectStore(HZ).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
  });
}

/** Tiles that touch the circle of `radiusM` around `center`. */
export function packTiles(center: LngLat, radiusM: number): Cell[] {
  return tilesAround(center, radiusM).filter((t) => {
    const cx = Math.min(Math.max(center[0], t.i * TILE_DEG), (t.i + 1) * TILE_DEG);
    const cy = Math.min(Math.max(center[1], t.j * TILE_DEG), (t.j + 1) * TILE_DEG);
    return Math.hypot((cx - center[0]) * 111320 * Math.cos((center[1] * Math.PI) / 180), (cy - center[1]) * 110540) <= radiusM;
  });
}

export interface PackProgress {
  done: number;
  total: number;
  failed: number;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Download every tile around a point that is not saved yet. Resumable: tiles already saved are skipped. */
export function downloadPack(center: LngLat, radiusM: number, onProgress: (p: PackProgress) => void, signal?: AbortSignal): Promise<PackProgress> {
  return downloadTiles(packTiles(center, radiusM), onProgress, signal);
}

/** Download the given tiles that are not saved yet. Resumable: tiles already saved are skipped. */
export async function downloadTiles(tiles: Cell[], onProgress: (p: PackProgress) => void, signal?: AbortSignal): Promise<PackProgress> {
  const p: PackProgress = { done: 0, total: tiles.length, failed: 0 };
  onProgress({ ...p });
  let next = 0;
  const worker = async () => {
    while (next < tiles.length && !signal?.aborted) {
      const t = tiles[next++];
      if (await getSaved(t)) {
        p.done++;
        onProgress({ ...p });
        continue;
      }
      try {
        const ways = await fetchRaw(packQuery(t), 70000, signal);
        if (await putSaved(t, ways)) p.done++;
        else p.failed++;
        // the hazard points for the same tile; if this part fails the roads are still saved
        if (!(await getPackHazards(t))) {
          try {
            await putHazards(t, await fetchHazardTile(t, signal));
          } catch {
            /* hazards are optional */
          }
        }
      } catch {
        p.failed++;
      }
      onProgress({ ...p });
      await pause(400); // be gentle with the shared public servers
    }
  };
  await Promise.all([worker(), worker()]);
  return p;
}
