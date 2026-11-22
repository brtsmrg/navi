import type { LngLat } from '@/core/types';

/** Decode a Google/Valhalla encoded polyline. Returns [lng, lat] pairs. */
export function decodePolyline(str: string, precision = 6): LngLat[] {
  const f = 10 ** precision;
  const out: LngLat[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        if (i >= str.length) throw new Error('Bad polyline');
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d;
      else lng += d;
    }
    out.push([lng / f, lat / f]);
  }
  return out;
}

export function encodePolyline(coords: LngLat[], precision = 6): string {
  const f = 10 ** precision;
  let pLat = 0;
  let pLng = 0;
  let out = '';
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of coords) {
    const la = Math.round(lat * f);
    const lo = Math.round(lng * f);
    out += enc(la - pLat) + enc(lo - pLng);
    pLat = la;
    pLng = lo;
  }
  return out;
}
