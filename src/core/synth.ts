import { localToLngLat } from './geo';
import type { LngLat, Route } from './types';

export type SynthSegment =
  | { type: 'straight'; length: number }
  | { type: 'arc'; radius: number; angleDeg: number; side: 'L' | 'R' };

/**
 * Build a route of straights and circular arcs of KNOWN radius, so the engine
 * can be checked against mathematical ground truth.
 */
export function synthRoute(
  segments: SynthSegment[],
  opts: { origin?: LngLat; stepM?: number; noiseM?: number; seed?: number } = {},
): Route {
  const origin = opts.origin ?? [-75.7, 45.4];
  const step = opts.stepM ?? 1;
  let seed = opts.seed ?? 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const pts: [number, number][] = [[0, 0]];
  let x = 0;
  let y = 0;
  let th = 0; // heading east
  for (const seg of segments) {
    if (seg.type === 'straight') {
      const n = Math.max(1, Math.round(seg.length / step));
      for (let i = 0; i < n; i++) {
        x += Math.cos(th) * (seg.length / n);
        y += Math.sin(th) * (seg.length / n);
        pts.push([x, y]);
      }
    } else {
      const arcLen = (seg.angleDeg * Math.PI) / 180 * seg.radius;
      const n = Math.max(2, Math.round(arcLen / step));
      const dth = ((seg.side === 'L' ? 1 : -1) * (seg.angleDeg * Math.PI) / 180) / n;
      const chord = 2 * seg.radius * Math.sin(Math.abs(dth) / 2);
      for (let i = 0; i < n; i++) {
        th += dth / 2;
        x += Math.cos(th) * chord;
        y += Math.sin(th) * chord;
        th += dth / 2;
        pts.push([x, y]);
      }
    }
  }
  const noise = opts.noiseM ?? 0;
  const coords = pts.map(([px, py]) =>
    localToLngLat(origin, px + (noise ? gauss() * noise : 0), py + (noise ? gauss() * noise : 0)),
  );
  return { coords, name: 'synthetic' };
}

/** A varied demo stage used by the app's "Ride along" mode. */
export function demoStage(): Route {
  const L = (radius: number, angleDeg: number): SynthSegment => ({ type: 'arc', radius, angleDeg, side: 'L' });
  const R = (radius: number, angleDeg: number): SynthSegment => ({ type: 'arc', radius, angleDeg, side: 'R' });
  const S = (length: number): SynthSegment => ({ type: 'straight', length });
  const r = synthRoute(
    [
      S(300), R(140, 40), S(120), L(90, 60), S(40), R(70, 70), S(260),
      L(220, 35), S(500), R(45, 95), S(80), L(32, 100), S(220),
      R(110, 55), R(55, 50), S(180), L(18, 170), S(150), R(24, 160), S(90),
      L(60, 80), S(350), R(300, 30), S(450), L(75, 90), S(60), R(100, 70), S(300),
    ],
    { stepM: 2 },
  );
  r.name = 'Demo stage';
  return r;
}
