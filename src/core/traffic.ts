/** Traffic along a route, as spans of distance (metres from the start) with a four-step level. */
export type TrafficLevel = 0 | 1 | 2 | 3;
export interface TrafficSpan {
  from: number;
  to: number;
  /** Traffic going the way you are going (right-hand side of the road as drawn). */
  level: TrafficLevel;
  /** Oncoming traffic (left side). When a source cannot tell, the arrows on that side repeat `level`. */
  opp?: TrafficLevel;
}

/** The same colours the turns use: green clear, yellow slow, orange heavy, red stopped. */
export const TRAFFIC_COLOR: Record<TrafficLevel, string> = { 0: '#7fd6a1', 1: '#e9d84a', 2: '#ff7a2b', 3: '#ff3b30' };
export const TRAFFIC_LABEL: Record<TrafficLevel, string> = { 0: 'clear', 1: 'slow', 2: 'heavy', 3: 'stopped' };

/** Level from current speed against free-flow speed. */
export function levelFromRatio(current: number, freeFlow: number): TrafficLevel {
  if (!(freeFlow > 0) || !(current >= 0)) return 0;
  const r = current / freeFlow;
  if (r >= 0.75) return 0;
  if (r >= 0.5) return 1;
  if (r >= 0.25) return 2;
  return 3;
}

/** Join neighbouring spans of the same level and drop empty ones. */
export function mergeSpans(spans: TrafficSpan[]): TrafficSpan[] {
  const out: TrafficSpan[] = [];
  for (const sp of [...spans].filter((x) => x.to > x.from).sort((a, b) => a.from - b.from)) {
    const last = out[out.length - 1];
    if (last && last.level === sp.level && last.opp === sp.opp && sp.from <= last.to + 1) last.to = Math.max(last.to, sp.to);
    else out.push({ ...sp });
  }
  return out;
}

/** Made-up but steady traffic, only for looking at the design and testing without a data key. */
export function sampleTraffic(distanceM: number): TrafficSpan[] {
  if (distanceM <= 0) return [];
  const f = [
    [0, 0.3, 0, 0],
    [0.3, 0.45, 1, 0],
    [0.45, 0.55, 2, 1],
    [0.55, 0.65, 3, 1],
    [0.65, 0.8, 1, 0],
    [0.8, 1, 0, 2],
  ] as const;
  return mergeSpans(f.map(([a, b, level, opp]) => ({ from: a * distanceM, to: b * distanceM, level, opp })));
}
