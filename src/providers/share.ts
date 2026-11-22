import type { LngLat } from '@/core/types';
import { decodePolyline, encodePolyline } from './polyline';

export interface SharePayload {
  waypoints: LngLat[];
  dialect?: string;
}

/** Share links carry only waypoints in the URL hash. No server, no account, nothing stored. */
export function buildShareUrl(origin: string, p: SharePayload): string {
  const q = new URLSearchParams();
  q.set('r', encodePolyline(p.waypoints, 5));
  if (p.dialect) q.set('d', p.dialect);
  return `${origin}/#${q.toString()}`;
}

export function parseShareHash(hash: string): SharePayload | null {
  try {
    const q = new URLSearchParams(hash.replace(/^#/, ''));
    const r = q.get('r');
    if (!r || r.length > 2000) return null;
    const waypoints = decodePolyline(r, 5);
    if (waypoints.length < 2 || waypoints.length > 25) return null;
    if (waypoints.some(([x, y]) => !(Math.abs(x) <= 180 && Math.abs(y) <= 90))) return null;
    return { waypoints, dialect: q.get('d') ?? undefined };
  } catch {
    return null;
  }
}
