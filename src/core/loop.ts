import { graphPoint, graphXY, type RoadClass, type RoadGraph } from './roam';
import type { LngLat } from './types';

/**
 * Fun loop: from where the driver is, find a round trip of about the asked length that is as twisty as the
 * local roads allow, without driving the same road twice and without motorways. The graph is the same one
 * Free roam uses. Candidates are laid out as rings of different size and direction, each routed with a cost
 * that likes bends and dislikes repeats, then scored; the best one wins.
 */

export interface LoopOptions {
  lengthM: number;
}

export interface LoopResult {
  coords: LngLat[];
  lengthM: number;
  /** degrees turned per km, the number the driver sees as "twistiness" */
  degPerKm: number;
  /** share of the loop that drives a road already used */
  repeat: number;
  score: number;
}

type Edge = RoadGraph['edges'][number];

const CLASS_COST: Record<RoadClass, number> = { motorway: 8, trunk: 3, primary: 1.6, secondary: 1, tertiary: 0.95, minor: 1.5 };

/** Degrees turned per km along an edge; tiny wobbles in the map data are ignored. */
export function edgeBend(e: Edge): number {
  const p = e.pts;
  let turned = 0;
  let prev: number | null = null;
  let last = p[0];
  for (let i = 1; i < p.length; i++) {
    const dx = p[i][0] - last[0];
    const dy = p[i][1] - last[1];
    if (Math.hypot(dx, dy) < 4) continue;
    const a = Math.atan2(dy, dx);
    if (prev !== null) {
      let d = Math.abs(a - prev);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const deg = (d * 180) / Math.PI;
      if (deg > 3) turned += Math.min(deg, 120);
    }
    prev = a;
    last = p[i];
  }
  return e.len > 0 ? (turned / e.len) * 1000 : 0;
}

class Heap {
  private a: [number, number][] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, v: number) {
    const a = this.a;
    a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

function nodePositions(g: RoadGraph): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>();
  for (const e of g.edges) {
    if (!m.has(e.from)) m.set(e.from, e.pts[0]);
    if (!m.has(e.to)) m.set(e.to, e.pts[e.pts.length - 1]);
  }
  return m;
}

function nearestNode(pos: Map<number, [number, number]>, x: number, y: number, maxM: number): number | null {
  let best: number | null = null;
  let bd = maxM;
  for (const [id, p] of pos) {
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

/** edge id shared by both directions of the same road piece */
const base = (e: Edge) => (e.twin !== undefined ? Math.min(e.id, e.twin) : e.id);

function route(g: RoadGraph, bend: number[], used: Map<number, number>, from: number, to: number): number[] | null {
  const dist = new Map<number, number>([[from, 0]]);
  const via = new Map<number, number>();
  const h = new Heap();
  h.push(0, from);
  while (h.size) {
    const [d, n] = h.pop()!;
    if (n === to) break;
    if (d > (dist.get(n) ?? Infinity)) continue;
    for (const id of g.out.get(n) ?? []) {
      const e = g.edges[id];
      const b = bend[id];
      // twisty roads are cheaper, repeats and big roads dearer
      const like = 1 / (1 + Math.min(b, 360) / 140);
      const repeat = 1 + 5 * (used.get(base(e)) ?? 0);
      const c = d + e.len * CLASS_COST[e.cls] * like * repeat + 6;
      if (c < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, c);
        via.set(e.to, id);
        h.push(c, e.to);
      }
    }
  }
  if (!via.has(to) && from !== to) return null;
  const path: number[] = [];
  for (let n = to; n !== from; ) {
    const id = via.get(n);
    if (id === undefined) return null;
    path.push(id);
    n = g.edges[id].from;
  }
  return path.reverse();
}

export function buildLoop(g: RoadGraph, start: LngLat, opts: LoopOptions): LoopResult | null {
  if (!g.edges.length) return null;
  const pos = nodePositions(g);
  const [sx, sy] = graphXY(g, start);
  const s = nearestNode(pos, sx, sy, 700);
  if (s === null) return null;
  const bend = g.edges.map(edgeBend);
  const L = opts.lengthM;
  let best: LoopResult | null = null;

  for (const scale of [0.8, 1, 1.25]) {
    // ring diameter: a road loop is about 1.4x longer than the straight ring
    const D = (L / (Math.PI * 1.4)) * scale;
    for (let a = 0; a < 360; a += 30) {
      const th = (a * Math.PI) / 180;
      const cx = sx + (Math.cos(th) * D) / 2;
      const cy = sy + (Math.sin(th) * D) / 2;
      const way: number[] = [];
      let ok = true;
      for (const off of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const ang = th + Math.PI + off; // ring point angle seen from the ring centre
        const n = nearestNode(pos, cx + Math.cos(ang) * (D / 2), cy + Math.sin(ang) * (D / 2), D * 0.35);
        if (n === null) {
          ok = false;
          break;
        }
        way.push(n);
      }
      if (!ok) continue;
      const used = new Map<number, number>();
      const edgesUsed: number[] = [];
      let cur = s;
      for (const n of [...way, s]) {
        const leg = route(g, bend, used, cur, n);
        if (!leg) {
          ok = false;
          break;
        }
        for (const id of leg) {
          const b = base(g.edges[id]);
          used.set(b, (used.get(b) ?? 0) + 1);
          edgesUsed.push(id);
        }
        cur = n;
      }
      if (!ok || edgesUsed.length < 4) continue;
      let len = 0;
      let rep = 0;
      let turned = 0;
      let big = 0;
      for (const id of edgesUsed) {
        const e = g.edges[id];
        len += e.len;
        if ((used.get(base(e)) ?? 0) > 1) rep += e.len;
        turned += (bend[id] * e.len) / 1000;
        if (e.cls === 'motorway' || e.cls === 'trunk') big += e.len;
      }
      if (len < L * 0.6 || len > L * 1.5) continue;
      const degPerKm = (turned / len) * 1000;
      const repeat = rep / len;
      const lenPenalty = Math.abs(len - L) / L;
      const score = Math.min(degPerKm, 300) * (1 - Math.min(repeat * 1.6, 0.95)) * (1 - Math.min(lenPenalty, 0.5)) * (1 - Math.min((big / len) * 1.5, 0.9));
      if (!best || score > best.score) {
        const coords: LngLat[] = [];
        for (const id of edgesUsed) {
          const pts = g.edges[id].pts;
          for (let i = coords.length ? 1 : 0; i < pts.length; i++) coords.push(graphPoint(g, pts[i][0], pts[i][1]));
        }
        best = { coords, lengthM: len, degPerKm, repeat, score };
      }
    }
  }
  return best;
}
