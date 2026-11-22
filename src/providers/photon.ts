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

export interface Category {
  id: string;
  label: string;
  /** OSM tags Photon filters on (OR within one key). */
  tags: string[];
  query: string;
}

export const CATEGORIES: Category[] = [
  { id: 'fuel', label: 'Fuel', tags: ['amenity:fuel'], query: 'fuel' },
  { id: 'charging', label: 'Charging', tags: ['amenity:charging_station'], query: 'charging' },
  { id: 'food', label: 'Food', tags: ['amenity:restaurant', 'amenity:fast_food'], query: 'restaurant' },
  { id: 'coffee', label: 'Coffee', tags: ['amenity:cafe'], query: 'coffee' },
  { id: 'parking', label: 'Parking', tags: ['amenity:parking'], query: 'parking' },
];

const toRad = (d: number) => (d * Math.PI) / 180;
/** Straight-line metres between two points, for sorting "near me" results. */
export function crowMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export type NearbyPlace = Place & { distanceM: number };

/** Places of one kind around a point, nearest first. */
export async function searchNearby(cat: Category, near: LngLat, signal?: AbortSignal): Promise<NearbyPlace[]> {
  const u = new URL('/api', CONFIG.photon);
  u.searchParams.set('q', cat.query);
  u.searchParams.set('limit', '12');
  u.searchParams.set('lang', 'en');
  u.searchParams.set('lon', String(near[0]));
  u.searchParams.set('lat', String(near[1]));
  u.searchParams.set('location_bias_scale', '0.1');
  for (const t of cat.tags) u.searchParams.append('osm_tag', t);
  const res = await fetch(u, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as { features?: Feature[] };
  return mapFeatures(json.features ?? [])
    .map((p) => ({ ...p, distanceM: crowMeters(near, p.lngLat) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 8);
}

/** Name for a dropped pin. Falls back to coordinates when the lookup fails. */
export async function reversePlace(at: LngLat, signal?: AbortSignal): Promise<Place> {
  const fallback: Place = { id: `pin${at[0].toFixed(5)},${at[1].toFixed(5)}`, title: 'Dropped pin', subtitle: `${at[1].toFixed(4)}, ${at[0].toFixed(4)}`, lngLat: at };
  try {
    const u = new URL('/reverse', CONFIG.photon);
    u.searchParams.set('lon', String(at[0]));
    u.searchParams.set('lat', String(at[1]));
    u.searchParams.set('lang', 'en');
    const res = await fetch(u, { signal, credentials: 'omit' });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { features?: Feature[] };
    const hit = mapFeatures(json.features ?? [])[0];
    return hit ? { ...hit, id: fallback.id, lngLat: at, title: hit.title || 'Dropped pin', subtitle: hit.subtitle || fallback.subtitle } : fallback;
  } catch {
    return fallback;
  }
}
