import { RouteTracker, levelFromRatio, mergeSpans, sampleTraffic, type Stage, type TrafficSpan } from '@/core';

export type TrafficSource = 'sample' | 'tomtom' | 'here';

const SPACING_M = 1500;
const MAX_POINTS = 14;

interface Flow {
  current: number;
  free: number;
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`traffic service answered ${r.status}`);
  return r.json();
}

async function tomtom(lat: number, lng: number, key: string, signal: AbortSignal): Promise<Flow | null> {
  const u = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${encodeURIComponent(key)}&point=${lat},${lng}`;
  const j = (await getJson(u, signal)) as { flowSegmentData?: { currentSpeed?: number; freeFlowSpeed?: number } };
  const d = j.flowSegmentData;
  return d && typeof d.currentSpeed === 'number' && typeof d.freeFlowSpeed === 'number' ? { current: d.currentSpeed, free: d.freeFlowSpeed } : null;
}

async function here(lat: number, lng: number, key: string, signal: AbortSignal): Promise<Flow | null> {
  const u = `https://data.traffic.hereapi.com/v7/flow?in=circle:${lat},${lng};r=250&locationReferencing=shape&apiKey=${encodeURIComponent(key)}`;
  const j = (await getJson(u, signal)) as { results?: { currentFlow?: { speed?: number; freeFlow?: number } }[] };
  const rs = (j.results ?? []).map((x) => x.currentFlow).filter((x): x is { speed: number; freeFlow: number } => typeof x?.speed === 'number' && typeof x.freeFlow === 'number');
  if (!rs.length) return null;
  return { current: rs.reduce((a, x) => a + x.speed, 0) / rs.length, free: rs.reduce((a, x) => a + x.freeFlow, 0) / rs.length };
}

/** Traffic spans for a stage. Throws if a keyed source cannot be reached at all. */
export async function fetchTraffic(stage: Stage, source: TrafficSource, key: string, signal: AbortSignal): Promise<TrafficSpan[]> {
  const total = stage.stats.distanceM;
  if (source === 'sample') return sampleTraffic(total);
  if (!key.trim()) throw new Error('add your traffic key in Settings first');
  const step = Math.max(SPACING_M, total / MAX_POINTS);
  const tracker = new RouteTracker(stage.route.coords);
  const ask = source === 'tomtom' ? tomtom : here;
  const jobs: Promise<TrafficSpan | null>[] = [];
  for (let from = 0; from < total; from += step) {
    const to = Math.min(total, from + step);
    const [lng, lat] = tracker.pointAt((from + to) / 2).lngLat;
    jobs.push(
      ask(lat, lng, key.trim(), signal)
        .then((f) => (f ? { from, to, level: levelFromRatio(f.current, f.free) } : null))
        .catch((e: unknown) => {
          if (signal.aborted) throw e;
          return null;
        }),
    );
  }
  const spans = (await Promise.all(jobs)).filter((x): x is TrafficSpan => x !== null);
  if (!spans.length) throw new Error('the traffic service gave no answer. Check the key and your connection');
  return mergeSpans(spans);
}
