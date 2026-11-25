import type { LngLat } from '@/core/types';
import { TILE_DEG, type Cell } from './overpass';

/**
 * A hand-drawn area to keep offline: a circle or a square. `sizeM` is how wide it is across
 * (the diameter of a circle, the side of a square), and it can never be more than MAX_AREA_M.
 */
export type AreaKind = 'circle' | 'square';
export interface Area {
  kind: AreaKind;
  center: LngLat;
  sizeM: number;
}

export const MAX_AREA_M = 150_000;
export const MIN_AREA_M = 2_000;

const M_LAT = 110540;
const mLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export const clampSize = (m: number) => Math.min(MAX_AREA_M, Math.max(MIN_AREA_M, m));

/** Metres between two points (flat-earth maths is exact enough at 150 km for choosing map pieces). */
export function distanceM(a: LngLat, b: LngLat): number {
  const lat = (a[1] + b[1]) / 2;
  return Math.hypot((b[0] - a[0]) * mLng(lat), (b[1] - a[1]) * M_LAT);
}

/** The map pieces that touch the area. A square takes every piece its box touches; a circle only those inside the ring. */
export function areaTiles(a: Area): Cell[] {
  const half = clampSize(a.sizeM) / 2;
  const dLat = half / M_LAT;
  const dLng = half / mLng(a.center[1]);
  const out: Cell[] = [];
  for (let i = Math.floor((a.center[0] - dLng) / TILE_DEG); i <= Math.floor((a.center[0] + dLng) / TILE_DEG); i++) {
    for (let j = Math.floor((a.center[1] - dLat) / TILE_DEG); j <= Math.floor((a.center[1] + dLat) / TILE_DEG); j++) {
      if (a.kind === 'circle') {
        const cx = Math.min(Math.max(a.center[0], i * TILE_DEG), (i + 1) * TILE_DEG);
        const cy = Math.min(Math.max(a.center[1], j * TILE_DEG), (j + 1) * TILE_DEG);
        if (distanceM(a.center, [cx, cy]) > half) continue;
      }
      out.push({ i, j });
    }
  }
  return out;
}

/** The outline to draw on the map. */
export function areaPolygon(a: Area): [number, number][] {
  const half = clampSize(a.sizeM) / 2;
  const dLat = half / M_LAT;
  const dLng = half / mLng(a.center[1]);
  const [x, y] = a.center;
  if (a.kind === 'square') return [[x - dLng, y - dLat], [x + dLng, y - dLat], [x + dLng, y + dLat], [x - dLng, y + dLat], [x - dLng, y - dLat]];
  const pts: [number, number][] = [];
  for (let k = 0; k <= 72; k++) {
    const t = (k / 72) * Math.PI * 2;
    pts.push([x + Math.cos(t) * dLng, y + Math.sin(t) * dLat]);
  }
  return pts;
}

/** Size from a drag: the finger's distance from the centre is the radius (circle) or the half side (square). */
export function sizeFromDrag(kind: AreaKind, center: LngLat, to: LngLat): number {
  if (kind === 'circle') return clampSize(distanceM(center, to) * 2);
  const dx = Math.abs(to[0] - center[0]) * mLng(center[1]);
  const dy = Math.abs(to[1] - center[1]) * M_LAT;
  return clampSize(Math.max(dx, dy) * 2);
}

export interface AreaEstimate {
  tiles: number;
  /** Rough size on the phone. A guess from typical map pieces; the real number shows while saving. */
  mbLow: number;
  mbHigh: number;
  /** Rough saving time with two downloads at a time. */
  minutes: number;
  /** Public-server requests this save will make (one for roads and one for hazards per piece). */
  requests: number;
}

const KB_LOW = 40;
const KB_HIGH = 300;
const SECONDS_PER_TILE = 4;

export function estimate(a: Area): AreaEstimate {
  const tiles = areaTiles(a).length;
  return {
    tiles,
    mbLow: (tiles * KB_LOW) / 1024,
    mbHigh: (tiles * KB_HIGH) / 1024,
    minutes: Math.max(1, Math.round((tiles * SECONDS_PER_TILE) / 2 / 60)),
    requests: tiles * 2,
  };
}

export function fmtSize(m: number, units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? `${(m / 1609.344).toFixed(m > 16093 ? 0 : 1)} mi` : `${(m / 1000).toFixed(m > 10000 ? 0 : 1)} km`;
}
