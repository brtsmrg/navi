import { generateStage, type LngLat, type Stage } from '@/core';
import { encodePolyline } from '@/providers/polyline';
import { fetchEdges, fetchRoute } from '@/providers/valhalla';

/** Route the waypoints, add road attributes when the router offers them, and write the notes. */
export async function planWaypoints(waypoints: LngLat[], signal?: AbortSignal): Promise<Stage> {
  const route = await fetchRoute(waypoints, signal);
  const edges = await fetchEdges(route, encodePolyline(route.coords, 6), signal).catch(() => undefined);
  return generateStage(edges ? { ...route, edges } : route);
}
