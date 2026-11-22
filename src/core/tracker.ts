import { buildLocal, EARTH_R, RAD, type Local } from './geo';
import type { LngLat } from './types';

export interface Snap {
  /** distance along the route (m) */
  s: number;
  /** lateral distance from the route (m) */
  offsetM: number;
  segment: number;
  relocated: boolean;
}

/**
 * Snaps GPS fixes to the route. Searches a window ahead of the last known
 * position so a road that doubles back next to itself cannot steal the match.
 */
export class RouteTracker {
  readonly local: Local;
  readonly length: number;

  constructor(private readonly coords: LngLat[]) {
    this.local = buildLocal(coords);
    this.length = this.local.s[coords.length - 1];
  }

  private segmentAt(s: number): number {
    const { s: cum } = this.local;
    let lo = 0;
    let hi = cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private project(i: number, lng: number, lat: number) {
    const { x, y, s } = this.local;
    const [lng0, lat0] = this.coords[i];
    const px = x[i] + (lng - lng0) * RAD * EARTH_R * Math.cos(lat0 * RAD);
    const py = y[i] + (lat - lat0) * RAD * EARTH_R;
    const ax = x[i];
    const ay = y[i];
    const bx = x[i + 1];
    const by = y[i + 1];
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
    const qx = ax + t * vx;
    const qy = ay + t * vy;
    return { s: s[i] + t * Math.sqrt(len2), off: Math.hypot(px - qx, py - qy) };
  }

  private scan(from: number, to: number, lng: number, lat: number) {
    let best = { s: 0, off: Infinity, seg: from };
    for (let i = from; i <= to; i++) {
      const r = this.project(i, lng, lat);
      if (r.off < best.off) best = { s: r.s, off: r.off, seg: i };
    }
    return best;
  }

  snap(lng: number, lat: number, hintS?: number): Snap {
    const last = this.coords.length - 2;
    if (hintS === undefined) {
      const g = this.scan(0, last, lng, lat);
      return { s: g.s, offsetM: g.off, segment: g.seg, relocated: false };
    }
    const a = this.segmentAt(Math.max(0, hintS - 40));
    const b = this.segmentAt(Math.min(this.length, hintS + 400));
    const w = this.scan(a, b, lng, lat);
    if (w.off <= 60) {
      // never move backwards by more than GPS jitter
      const s = w.s < hintS - 15 ? hintS : w.s;
      return { s, offsetM: w.off, segment: w.seg, relocated: false };
    }
    const g = this.scan(0, last, lng, lat);
    if (g.off < w.off - 10) return { s: g.s, offsetM: g.off, segment: g.seg, relocated: true };
    return { s: w.s, offsetM: w.off, segment: w.seg, relocated: false };
  }

  /** Position at a distance along the route. */
  pointAt(sM: number): { lngLat: LngLat; bearingDeg: number } {
    const s = Math.min(this.length, Math.max(0, sM));
    const i = this.segmentAt(s);
    const seg = this.local.s[i + 1] - this.local.s[i];
    const f = seg > 0 ? (s - this.local.s[i]) / seg : 0;
    const [x0, y0] = this.coords[i];
    const [x1, y1] = this.coords[i + 1];
    const dx = (x1 - x0) * Math.cos(y0 * RAD);
    const dy = y1 - y0;
    const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    return { lngLat: [x0 + f * (x1 - x0), y0 + f * (y1 - y0)], bearingDeg: bearing };
  }
}
