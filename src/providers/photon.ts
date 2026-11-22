import type { LngLat } from '@/core/types';
import { CONFIG } from './config';

export interface Place {
  id: string;
  title: string;
  subtitle: string;
  lngLat: LngLat;
}

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
}

export function mapFeatures(features: Feature[]): Place[] {
  return features.map((f, i) => {
    const p = f.properties;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const title = String(p.name ?? (street || p.city || 'Place'));
    const subtitle = [p.name ? street : '', p.city !== p.name ? p.city : '', p.state, p.country]
      .filter(Boolean)
      .join(', ');
    return {
      id: `${p.osm_type ?? 'x'}${p.osm_id ?? i}`,
      title,
      subtitle,
      lngLat: [f.geometry.coordinates[0], f.geometry.coordinates[1]],
    };
  });
}

export async function searchPlaces(q: string, bias?: LngLat, signal?: AbortSignal): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  const u = new URL('/api', CONFIG.photon);
  u.searchParams.set('q', query);
  u.searchParams.set('limit', '5');
  u.searchParams.set('lang', 'en');
  if (bias) {
    u.searchParams.set('lon', String(bias[0]));
    u.searchParams.set('lat', String(bias[1]));
  }
  const res = await fetch(u, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as { features?: Feature[] };
  return mapFeatures(json.features ?? []);
}
