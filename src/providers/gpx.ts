import type { LngLat, Route } from '@/core/types';

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Minimal, dependency-free GPX reader (track points, else route points).
 * It is a tag scanner, not an XML parser: no entities or DTDs are ever resolved.
 */
export function parseGpx(xml: string): Route {
  if (xml.length > MAX_BYTES) throw new Error('GPX file is too large (20 MB max)');
  const grab = (tag: string): LngLat[] => {
    const re = new RegExp(`<${tag}\\s+([^>]*?)/?>`, 'gi');
    const pts: LngLat[] = [];
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
      const lat = /\blat\s*=\s*["']([-+0-9.eE]+)["']/.exec(m[1]);
      const lon = /\blon\s*=\s*["']([-+0-9.eE]+)["']/.exec(m[1]);
      if (lat && lon) {
        const la = Number(lat[1]);
        const lo = Number(lon[1]);
        if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) pts.push([lo, la]);
      }
    }
    return pts;
  };
  let coords = grab('trkpt');
  if (coords.length < 2) coords = grab('rtept');
  if (coords.length < 2) throw new Error('No track found in this GPX file');
  const name = /<name>\s*([^<]{1,80}?)\s*<\/name>/i.exec(xml)?.[1];
  return { coords, name: name ?? 'Imported route' };
}
