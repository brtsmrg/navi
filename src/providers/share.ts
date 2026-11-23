import { sanitizeEdits, type EditMap } from '@/core/edits';
import type { LngLat } from '@/core/types';
import { decodePolyline, encodePolyline } from './polyline';

export interface SharePayload {
  waypoints: LngLat[];
  dialect?: string;
  /** Names of the start and destination, so the receiver sees places and not "Route". */
  names?: [string, string];
  /** The sender's pacenote edits, and the route key they belong to. Only used if the receiver's route matches. */
  edits?: EditMap;
  key?: string;
}

const MAX_EDITS_CHARS = 1500;

function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Share links carry only waypoints (and optionally names and pacenote edits) in the URL hash. No server, no account, nothing stored. */
export function buildShareUrl(origin: string, p: SharePayload): string {
  const q = new URLSearchParams();
  q.set('r', encodePolyline(p.waypoints, 5));
  if (p.dialect) q.set('d', p.dialect);
  if (p.names) q.set('n', p.names.map((n) => n.replace(/~/g, ' ').slice(0, 40)).join('~'));
  if (p.edits && Object.keys(p.edits).length > 0 && p.key) {
    const e = toB64Url(JSON.stringify(p.edits));
    if (e.length <= MAX_EDITS_CHARS) {
      q.set('e', e);
      q.set('k', p.key);
    }
  }
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
    const out: SharePayload = { waypoints, dialect: q.get('d') ?? undefined };
    const n = q.get('n');
    if (n) {
      const [a, b] = n.split('~').map((t) => t.replace(/[<>]/g, '').trim().slice(0, 40));
      if (a && b) out.names = [a, b];
    }
    const e = q.get('e');
    const k = q.get('k');
    if (e && k && e.length <= MAX_EDITS_CHARS && k.length <= 200) {
      try {
        const edits = sanitizeEdits(JSON.parse(fromB64Url(e)));
        if (Object.keys(edits).length > 0) {
          out.edits = edits;
          out.key = k;
        }
      } catch {
        /* damaged edit data: open the route without them */
      }
    }
    return out;
  } catch {
    return null;
  }
}
