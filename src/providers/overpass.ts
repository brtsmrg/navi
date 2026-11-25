import type { LngLat } from '@/core/types';
import type { RoadClass, RoadWay } from '@/core/roam';
import type { Hazard } from '@/core/hazards';

/**
 * Road geometry for Free roam, from the public OpenStreetMap Overpass servers (HTTPS only, read only,
 * no account, nothing about the driver is sent beyond the map square being asked for). The map is
 * fetched in small squares and kept, so a drive re-uses what it has already seen.
 */
export const OVERPASS_MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'] as const;

/** Size of one map square in degrees (about 1.1 km north to south). */
export const CELL_DEG = 0.01;

export interface Cell {
  i: number;
  j: number;
}

export const cellKey = (c: Cell) => `${c.i}:${c.j}`;
export const cellOf = (p: LngLat): Cell => ({ i: Math.floor(p[0] / CELL_DEG), j: Math.floor(p[1] / CELL_DEG) });

/** The square the point is in plus the eight around it (about 3.3 km wide), nearest first. */
export function cellsAround(p: LngLat, radius = 1): Cell[] {
  const c = cellOf(p);
  const out: Cell[] = [];
  for (let di = -radius; di <= radius; di++) for (let dj = -radius; dj <= radius; dj++) out.push({ i: c.i + di, j: c.j + dj });
  return out.sort((a, b) => Math.hypot(a.i - c.i, a.j - c.j) - Math.hypot(b.i - c.i, b.j - c.j));
}

export const HIGHWAYS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';

export function buildQuery(c: Cell): string {
  const s = (c.j * CELL_DEG).toFixed(5);
  const w = (c.i * CELL_DEG).toFixed(5);
  const n = ((c.j + 1) * CELL_DEG).toFixed(5);
  const e = ((c.i + 1) * CELL_DEG).toFixed(5);
  return `[out:json][timeout:12];way["highway"~"^(${HIGHWAYS})$"]["access"!~"^(private|no)$"](${s},${w},${n},${e});out geom;`;
}

interface RawWay {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

const CLASS: Record<string, RoadClass> = {
  motorway: 'motorway', motorway_link: 'motorway',
  trunk: 'trunk', trunk_link: 'trunk',
  primary: 'primary', primary_link: 'primary',
  secondary: 'secondary', secondary_link: 'secondary',
  tertiary: 'tertiary', tertiary_link: 'tertiary',
  unclassified: 'minor', residential: 'minor', living_street: 'minor',
};

/** Turn an Overpass answer into road ways. Anything unexpected is skipped, never trusted. */
export function parseOverpass(json: unknown): RoadWay[] {
  const els = (json as { elements?: RawWay[] } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: RoadWay[] = [];
  for (const el of els) {
    if (el?.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const tags = el.tags ?? {};
    const cls = CLASS[tags.highway ?? ''];
    if (!cls) continue;
    const coords: LngLat[] = [];
    for (const g of el.geometry) {
      if (typeof g?.lat === 'number' && typeof g?.lon === 'number' && Math.abs(g.lat) <= 90 && Math.abs(g.lon) <= 180) coords.push([g.lon, g.lat]);
    }
    if (coords.length < 2) continue;
    const ow = (tags.oneway ?? '').toLowerCase();
    let oneway: RoadWay['oneway'] = 'no';
    if (ow === 'yes' || ow === 'true' || ow === '1') oneway = 'yes';
    else if (ow === '-1' || ow === 'reverse') oneway = '-1';
    else if (tags.junction === 'roundabout' || tags.junction === 'circular' || (tags.highway ?? '').startsWith('motorway') && ow !== 'no') oneway = 'yes';
    out.push({ id: String(el.id ?? out.length), coords, cls, name: tags.name?.slice(0, 80), ref: tags.ref?.slice(0, 40), oneway });
  }
  return out;
}

const cache = new Map<string, RoadWay[]>();
const inflight = new Map<string, Promise<RoadWay[]>>();

async function fetchOne(url: string, query: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${url}?data=${encodeURIComponent(query)}`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(`Road data failed (${res.status})`);
  return res.json();
}

/** Ask the public servers one question, trying each in turn. Nothing is kept. */
async function fetchJson(query: string, timeoutMs: number, outer?: AbortSignal): Promise<unknown> {
  let last: unknown;
  for (const url of OVERPASS_MIRRORS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const onOuter = () => ctl.abort();
    outer?.addEventListener('abort', onOuter);
    try {
      return await fetchOne(url, query, ctl.signal);
    } catch (e) {
      last = e;
      if (outer?.aborted) break;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    }
  }
  throw last instanceof Error ? last : new Error('Road data is not reachable');
}

export async function fetchRaw(query: string, timeoutMs: number, outer?: AbortSignal): Promise<RoadWay[]> {
  return parseOverpass(await fetchJson(query, timeoutMs, outer));
}

function fetchKeyed(k: string, query: string, timeoutMs: number, outer?: AbortSignal): Promise<RoadWay[]> {
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(k);
  if (running) return running;
  const p = fetchRaw(query, timeoutMs, outer)
    .then((ways) => {
      cache.set(k, ways);
      return ways;
    })
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** One map square, from memory when seen before. Tries each server in turn, 9 s each. */
export function fetchCell(c: Cell, outer?: AbortSignal): Promise<RoadWay[]> {
  return fetchKeyed(cellKey(c), buildQuery(c), 9000, outer);
}

/* Fun loop: a wide area of the roads worth driving (no small residential streets), in big tiles. */
export const TILE_DEG = 0.05;
const LOOP_HIGHWAYS = 'primary|secondary|tertiary|unclassified|primary_link|secondary_link|tertiary_link';

export function tilesAround(p: LngLat, radiusM: number): Cell[] {
  const dLat = radiusM / 110540;
  const dLng = radiusM / (111320 * Math.cos((p[1] * Math.PI) / 180));
  const out: Cell[] = [];
  for (let i = Math.floor((p[0] - dLng) / TILE_DEG); i <= Math.floor((p[0] + dLng) / TILE_DEG); i++)
    for (let j = Math.floor((p[1] - dLat) / TILE_DEG); j <= Math.floor((p[1] + dLat) / TILE_DEG); j++) out.push({ i, j });
  return out;
}

export function buildTileQuery(c: Cell): string {
  const s = (c.j * TILE_DEG).toFixed(5);
  const w = (c.i * TILE_DEG).toFixed(5);
  const n = ((c.j + 1) * TILE_DEG).toFixed(5);
  const e = ((c.i + 1) * TILE_DEG).toFixed(5);
  return `[out:json][timeout:25];way["highway"~"^(${LOOP_HIGHWAYS})$"]["access"!~"^(private|no)$"](${s},${w},${n},${e});out geom;`;
}

export function fetchTile(c: Cell, outer?: AbortSignal): Promise<RoadWay[]> {
  return fetchKeyed(`t${cellKey(c)}`, buildTileQuery(c), 28000, outer);
}

export function clearRoadCache(): void {
  cache.clear();
  hazardCache.clear();
}

/* Hazards: single map points worth a call. */
const HAZARD_CALMING = /^(bump|hump|table|cushion|rumble_strip)$/;
const HAZARD_NARROW = /^(choker|chicane)$/;

export function buildHazardQuery(c: Cell): string {
  const bb = `(${(c.j * TILE_DEG).toFixed(5)},${(c.i * TILE_DEG).toFixed(5)},${((c.j + 1) * TILE_DEG).toFixed(5)},${((c.i + 1) * TILE_DEG).toFixed(5)})`;
  return `[out:json][timeout:25];(node["traffic_calming"~"^(bump|hump|table|cushion|rumble_strip|choker|chicane)$"]${bb};node["railway"="level_crossing"]${bb};node["highway"="speed_camera"]${bb};);out;`;
}

/** Turn an Overpass answer into hazard points. Anything unexpected is skipped. */
export function parseHazards(json: unknown): Hazard[] {
  const els = (json as { elements?: { type?: string; lat?: number; lon?: number; tags?: Record<string, string> }[] } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: Hazard[] = [];
  for (const el of els) {
    if (el?.type !== 'node' || typeof el.lat !== 'number' || typeof el.lon !== 'number' || Math.abs(el.lat) > 90 || Math.abs(el.lon) > 180) continue;
    const t = el.tags ?? {};
    let kind: Hazard['kind'] | undefined;
    if (t.highway === 'speed_camera') kind = 'camera';
    else if (t.railway === 'level_crossing') kind = 'rail';
    else if (HAZARD_NARROW.test(t.traffic_calming ?? '')) kind = 'narrow';
    else if (HAZARD_CALMING.test(t.traffic_calming ?? '')) kind = 'bump';
    if (kind) out.push({ lng: el.lon, lat: el.lat, kind });
  }
  return out;
}

const hazardCache = new Map<string, Hazard[]>();
export async function fetchHazardTile(c: Cell, outer?: AbortSignal): Promise<Hazard[]> {
  const k = cellKey(c);
  const hit = hazardCache.get(k);
  if (hit) return hit;
  const list = parseHazards(await fetchJson(buildHazardQuery(c), 28000, outer));
  hazardCache.set(k, list);
  return list;
}
