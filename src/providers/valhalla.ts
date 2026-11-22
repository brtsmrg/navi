import { buildLocal } from '@/core/geo';
import type { EdgeAttr, LngLat, Maneuver, Route } from '@/core/types';
import { CONFIG } from './config';
import { decodePolyline } from './polyline';

/* Valhalla maneuver type codes (DirectionsLeg.Maneuver.Type). */
const T = {
  slightRight: 9, right: 10, sharpRight: 11, uturnRight: 12, uturnLeft: 13,
  sharpLeft: 14, left: 15, slightLeft: 16, rampRight: 18, rampLeft: 19,
  exitRight: 20, exitLeft: 21, merge: 25, roundaboutEnter: 26, roundaboutExit: 27,
  mergeRight: 37, mergeLeft: 38,
} as const;

interface RawManeuver {
  type: number;
  begin_shape_index: number;
  end_shape_index?: number;
  roundabout_exit_count?: number;
  street_names?: string[];
}
interface RawLeg {
  shape: string;
  maneuvers?: RawManeuver[];
}
interface RawRoute {
  trip?: { legs?: RawLeg[]; summary?: { length?: number; time?: number } };
}

export function mapManeuvers(legs: RawLeg[]): Maneuver[] {
  const out: Maneuver[] = [];
  let offset = 0;
  for (const leg of legs) {
    const pts = decodePolyline(leg.shape, 6).length;
    const ms = leg.maneuvers ?? [];
    ms.forEach((m, i) => {
      const idx = m.begin_shape_index + offset;
      const street = m.street_names?.[0];
      const turn = (side: 'L' | 'R', sharpness: Maneuver['sharpness'], kind: Maneuver['kind'] = 'turn') =>
        out.push({ shapeIndex: idx, kind, side, sharpness, street });
      switch (m.type) {
        case T.slightRight: turn('R', 'slight'); break;
        case T.right: turn('R', 'normal'); break;
        case T.sharpRight: turn('R', 'sharp'); break;
        case T.slightLeft: turn('L', 'slight'); break;
        case T.left: turn('L', 'normal'); break;
        case T.sharpLeft: turn('L', 'sharp'); break;
        case T.uturnRight: turn('R', 'sharp', 'uturn'); break;
        case T.uturnLeft: turn('L', 'sharp', 'uturn'); break;
        case T.rampRight:
        case T.exitRight: out.push({ shapeIndex: idx, kind: 'exit', side: 'R', street }); break;
        case T.rampLeft:
        case T.exitLeft: out.push({ shapeIndex: idx, kind: 'exit', side: 'L', street }); break;
        case T.merge:
        case T.mergeLeft:
        case T.mergeRight: out.push({ shapeIndex: idx, kind: 'merge' }); break;
        case T.roundaboutEnter: {
          const exitM = ms.slice(i + 1).find((x) => x.type === T.roundaboutExit);
          out.push({
            shapeIndex: idx,
            endShapeIndex: exitM ? exitM.begin_shape_index + offset : undefined,
            kind: 'roundabout',
            exitCount: m.roundabout_exit_count,
          });
          break;
        }
        default:
          break; // start, destination, continue, stay-*: geometry already says it
      }
    });
    offset += pts - 1;
  }
  return out;
}

/** Parse a Valhalla /route response into a Navi Route. */
export function parseRoute(json: RawRoute): Route {
  const legs = json.trip?.legs;
  if (!legs?.length) throw new Error('No route found');
  const coords: LngLat[] = [];
  legs.forEach((leg, i) => {
    const pts = decodePolyline(leg.shape, 6);
    coords.push(...(i === 0 ? pts : pts.slice(1)));
  });
  const s = json.trip?.summary;
  return {
    coords,
    distance: s?.length !== undefined ? s.length * 1000 : undefined,
    duration: s?.time,
    maneuvers: mapManeuvers(legs),
  };
}

async function getJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  return res.json();
}

export interface AvoidOptions {
  highways?: boolean;
  tolls?: boolean;
  ferries?: boolean;
}

/** Valhalla "use_*" factors run 0 (avoid) to 1 (prefer); anything not avoided is left at the router default. */
export function costingOptions(a: AvoidOptions | undefined): { auto: Record<string, number> } | undefined {
  if (!a) return undefined;
  const auto: Record<string, number> = {};
  if (a.highways) auto.use_highways = 0;
  if (a.tolls) auto.use_tolls = 0;
  if (a.ferries) auto.use_ferry = 0;
  return Object.keys(auto).length ? { auto } : undefined;
}

export async function fetchRoute(waypoints: LngLat[], signal?: AbortSignal, avoid?: AvoidOptions): Promise<Route> {
  if (waypoints.length < 2) throw new Error('Need a start and an end');
  const costing_options = costingOptions(avoid);
  const body = {
    locations: waypoints.map(([lon, lat]) => ({ lat, lon })),
    costing: 'auto',
    ...(costing_options ? { costing_options } : {}),
    directions_options: { language: 'en-US' },
  };
  const url = `${CONFIG.valhalla}/route?json=${encodeURIComponent(JSON.stringify(body))}`;
  const route = parseRoute((await getJson(url, { signal })) as RawRoute);
  return route;
}

interface RawEdge {
  speed_limit?: number;
  surface?: string;
  road_class?: string;
  begin_shape_index: number;
  end_shape_index: number;
}

export function mapEdges(edges: RawEdge[], coords: LngLat[]): EdgeAttr[] {
  const { s } = buildLocal(coords);
  const last = coords.length - 1;
  return edges.map((e) => ({
    fromS: s[Math.min(e.begin_shape_index, last)],
    toS: s[Math.min(e.end_shape_index, last)],
    speedLimit: e.speed_limit && e.speed_limit > 0 && e.speed_limit < 250 ? e.speed_limit : undefined,
    surface: e.surface,
    roadClass: e.road_class,
  }));
}

/** Optional: speed limits / surface along a route. Fails soft. */
export async function fetchEdges(route: Route, encodedShape: string, signal?: AbortSignal): Promise<EdgeAttr[] | undefined> {
  try {
    const body = {
      encoded_polyline: encodedShape,
      costing: 'auto',
      shape_match: 'edge_walk',
      filters: {
        attributes: ['edge.speed_limit', 'edge.surface', 'edge.road_class', 'edge.begin_shape_index', 'edge.end_shape_index'],
        action: 'include',
      },
    };
    const json = (await getJson(`${CONFIG.valhalla}/trace_attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })) as { edges?: RawEdge[] };
    return json.edges ? mapEdges(json.edges, route.coords) : undefined;
  } catch {
    return undefined;
  }
}
