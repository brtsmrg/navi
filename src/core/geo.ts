import type { LngLat } from './types';

export const EARTH_R = 6371008.8;
export const RAD = Math.PI / 180;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function wrapAngle(a: number): number {
  return ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

export interface Local {
  /** metres east of the first vertex */
  x: Float64Array;
  /** metres north of the first vertex */
  y: Float64Array;
  /** cumulative path length at each vertex (m) */
  s: Float64Array;
}

/**
 * Project a lng/lat polyline to a local metric plane. Each segment uses the
 * cosine of its own mid-latitude, so lengths stay accurate over long routes.
 * Zero-length segments are kept so that vertex indices stay aligned with the
 * source (routers reference maneuvers by vertex index).
 */
export function buildLocal(coords: LngLat[]): Local {
  const n = coords.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const latm = ((lat1 + lat2) / 2) * RAD;
    const dx = (lng2 - lng1) * RAD * EARTH_R * Math.cos(latm);
    const dy = (lat2 - lat1) * RAD * EARTH_R;
    x[i] = x[i - 1] + dx;
    y[i] = y[i - 1] + dy;
    s[i] = s[i - 1] + Math.hypot(dx, dy);
  }
  return { x, y, s };
}

/** Inverse of the local plane around an origin (used by the synthetic route builder). */
export function localToLngLat(origin: LngLat, x: number, y: number): LngLat {
  const lat = origin[1] + y / (EARTH_R * RAD);
  const lng = origin[0] + x / (EARTH_R * RAD * Math.cos(origin[1] * RAD));
  return [lng, lat];
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
