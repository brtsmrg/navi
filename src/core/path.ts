import { buildLocal, wrapAngle } from './geo';
import type { LngLat } from './types';

/** A route resampled at uniform spacing, with heading and signed curvature. */
export interface Path {
  n: number;
  /** actual spacing between samples (m) */
  ds: number;
  length: number;
  s: Float64Array;
  x: Float64Array;
  y: Float64Array;
  lng: Float64Array;
  lat: Float64Array;
  /** cumulative distance at each *source* vertex (aligned with Route.coords) */
  srcS: Float64Array;
  /** heading (rad, math convention: 0 = east, CCW positive) */
  heading: Float64Array;
  /** signed curvature (1/m); positive = turning left */
  kappa: Float64Array;
  /** curvature on a short (+-5 m) window; resolves corners tighter than ~40 m */
  kappaFine: Float64Array;
}

/** Resample to ~stepM spacing along the polyline (linear interpolation). */
export function resample(coords: LngLat[], stepM = 5): Path {
  if (coords.length < 2) throw new Error('Route needs at least 2 points');
  const L = buildLocal(coords);
  const total = L.s[coords.length - 1];
  if (!(total > 0)) throw new Error('Route has zero length');
  const n = Math.max(2, Math.ceil(total / stepM) + 1);
  const ds = total / (n - 1);
  const s = new Float64Array(n);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const lng = new Float64Array(n);
  const lat = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = i * ds;
    while (j < coords.length - 2 && L.s[j + 1] < t) j++;
    const segLen = L.s[j + 1] - L.s[j];
    const f = segLen > 0 ? Math.min(1, Math.max(0, (t - L.s[j]) / segLen)) : 0;
    s[i] = t;
    x[i] = L.x[j] + f * (L.x[j + 1] - L.x[j]);
    y[i] = L.y[j] + f * (L.y[j + 1] - L.y[j]);
    lng[i] = coords[j][0] + f * (coords[j + 1][0] - coords[j][0]);
    lat[i] = coords[j][1] + f * (coords[j + 1][1] - coords[j][1]);
  }
  const heading = new Float64Array(n);
  const kappa = new Float64Array(n);
  const kappaFine = new Float64Array(n);
  const path: Path = { n, ds, length: total, s, x, y, lng, lat, srcS: L.s, heading, kappa, kappaFine };
  computeCurvature(path);
  return path;
}

/**
 * Heading = direction of the chord spanning +-headingHalfM around each sample.
 * Curvature = wrapped heading change across +-curvHalfM divided by the arc
 * length between those samples. Both are exact for a circular arc (symmetry),
 * and the chord windows suppress digitisation noise from OSM vertices.
 */
export function computeCurvature(path: Path): void {
  curvature(path, 10, 15, path.heading, path.kappa);
  curvature(path, 5, 5, new Float64Array(path.n), path.kappaFine);
}

function curvature(
  path: Path,
  headingHalfM: number,
  curvHalfM: number,
  heading: Float64Array,
  kappa: Float64Array,
): void {
  const { n, ds, s, x, y } = path;
  const k = Math.max(1, Math.round(headingHalfM / ds));
  const m = Math.max(1, Math.round(curvHalfM / ds));
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - k);
    const b = Math.min(n - 1, i + k);
    heading[i] = Math.atan2(y[b] - y[a], x[b] - x[a]);
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - m);
    const b = Math.min(n - 1, i + m);
    const span = s[b] - s[a];
    kappa[i] = span > 0 ? wrapAngle(heading[b] - heading[a]) / span : 0;
  }
}

/** Index of the sample at or just before distance sM. */
export function indexAt(path: Path, sM: number): number {
  const i = Math.floor(sM / path.ds);
  return Math.min(path.n - 1, Math.max(0, i));
}
