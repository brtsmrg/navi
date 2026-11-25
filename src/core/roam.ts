import { EARTH_R, RAD } from './geo';
import type { LngLat } from './types';

/**
 * Free roam: no destination, so Navi has to guess the road ahead. It builds a small road graph from
 * way geometry (OpenStreetMap-shaped), snaps the car to it, and follows the road the way a driver
 * would: straight on where it can, staying on the same numbered or named road, and never taking
 * a small side road when the main road carries on. The result is a polyline that the normal
 * pacenote engine reads like any planned route.
 */

export type RoadClass = 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'minor';

const RANK: Record<RoadClass, number> = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, minor: 5 };

export interface RoadWay {
  id: string;
  coords: LngLat[];
  cls: RoadClass;
  name?: string;
  ref?: string;
  /** 'yes' = drawn direction only, '-1' = against the drawn direction only */
  oneway?: 'yes' | '-1' | 'no';
}

interface Edge {
  id: number;
  from: number;
  to: number;
  /** local metres */
  pts: [number, number][];
  len: number;
  cls: RoadClass;
  name?: string;
  ref?: string;
  wayId: string;
  /** the same edge walked the other way, when that is allowed */
  twin?: number;
}

export interface RoadGraph {
  origin: LngLat;
  edges: Edge[];
  out: Map<number, number[]>;
  nodeCount: number;
}

export interface RoamOptions {
  lengthM: number;
  /** -1 (take the right-most branch) to +1 (left-most) at the first junction; used by game mode */
  firstJunctionBias?: number;
}

export interface RoamResult {
  coords: LngLat[];
  /** how far the car is from the road it was matched to (m) */
  offsetM: number;
  /** Junctions passed on the way: distance along the result (m) and how many ways on. */
  junctions: { s: number; options: number }[];
  /** the road the car is on, for the screen */
  road?: string;
}

const KEY_SCALE = 1e6; // 0.1 m: shared OSM nodes carry identical coordinates

function proj(origin: LngLat, p: LngLat): [number, number] {
  return [(p[0] - origin[0]) * RAD * EARTH_R * Math.cos(origin[1] * RAD), (p[1] - origin[1]) * RAD * EARTH_R];
}

function unproj(origin: LngLat, x: number, y: number): LngLat {
  return [origin[0] + x / (RAD * EARTH_R * Math.cos(origin[1] * RAD)), origin[1] + y / (RAD * EARTH_R)];
}

function key(p: LngLat): string {
  return `${Math.round(p[0] * KEY_SCALE)},${Math.round(p[1] * KEY_SCALE)}`;
}

/** Split every way at junction vertices and turn the pieces into directed edges. */
export function buildGraph(ways: RoadWay[]): RoadGraph {
  const usable = ways.filter((w) => w.coords.length >= 2);
  const origin: LngLat = usable.length ? usable[0].coords[0] : [0, 0];
  // how many ways touch each vertex; an endpoint always counts as a junction
  const seen = new Map<string, number>();
  for (const w of usable) {
    w.coords.forEach((p, i) => {
      const k = key(p);
      const add = i === 0 || i === w.coords.length - 1 ? 2 : 1;
      seen.set(k, (seen.get(k) ?? 0) + add);
    });
  }
  const nodeIds = new Map<string, number>();
  const nodeId = (k: string) => {
    let id = nodeIds.get(k);
    if (id === undefined) {
      id = nodeIds.size;
      nodeIds.set(k, id);
    }
    return id;
  };
  const edges: Edge[] = [];
  const out = new Map<number, number[]>();
  const addEdge = (e: Omit<Edge, 'id'>): number => {
    const id = edges.length;
    edges.push({ ...e, id });
    const list = out.get(e.from) ?? [];
    list.push(id);
    out.set(e.from, list);
    return id;
  };
  for (const w of usable) {
    const pts = w.coords.map((p) => proj(origin, p));
    let start = 0;
    for (let i = 1; i < w.coords.length; i++) {
      const isNode = i === w.coords.length - 1 || (seen.get(key(w.coords[i])) ?? 0) >= 2;
      if (!isNode) continue;
      const piece = pts.slice(start, i + 1);
      let len = 0;
      for (let j = 1; j < piece.length; j++) len += Math.hypot(piece[j][0] - piece[j - 1][0], piece[j][1] - piece[j - 1][1]);
      if (len > 0.5) {
        const a = nodeId(key(w.coords[start]));
        const b = nodeId(key(w.coords[i]));
        const base = { cls: w.cls, name: w.name, ref: w.ref, wayId: w.id, len };
        const fwd = w.oneway !== '-1';
        const back = w.oneway !== 'yes';
        let f: number | undefined;
        let r: number | undefined;
        if (fwd) f = addEdge({ ...base, from: a, to: b, pts: piece });
        if (back) r = addEdge({ ...base, from: b, to: a, pts: [...piece].reverse() });
        if (f !== undefined && r !== undefined) {
          edges[f].twin = r;
          edges[r].twin = f;
        }
      }
      start = i;
    }
  }
  return { origin, edges, out, nodeCount: nodeIds.size };
}

interface Proj {
  edge: Edge;
  /** distance along the edge (m) */
  along: number;
  offset: number;
  /** direction of travel at the projection, radians, 0 = east, counter-clockwise */
  dir: number;
}

function projectOnEdge(e: Edge, x: number, y: number): Proj {
  let best = { along: 0, offset: Infinity, dir: 0 };
  let run = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const [ax, ay] = e.pts[i - 1];
    const [bx, by] = e.pts[i];
    const vx = bx - ax;
    const vy = by - ay;
    const l2 = vx * vx + vy * vy;
    const seg = Math.sqrt(l2);
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2)) : 0;
    const off = Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
    if (off < best.offset) best = { along: run + t * seg, offset: off, dir: Math.atan2(vy, vx) };
    run += seg;
  }
  return { edge: e, ...best };
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Bearing in degrees clockwise from north to a counter-clockwise-from-east angle. */
export function compassToDir(bearingDeg: number): number {
  return (90 - bearingDeg) * RAD;
}

/** Direction (radians) of the last or first `span` metres of a point list, from the node outward or inward. */
function dirOf(pts: [number, number][], atEnd: boolean, span = 25): number {
  if (atEnd) {
    const [ex, ey] = pts[pts.length - 1];
    let k = pts.length - 2;
    let [px, py] = pts[k];
    while (k > 0 && Math.hypot(ex - px, ey - py) < span) {
      k--;
      [px, py] = pts[k];
    }
    return Math.atan2(ey - py, ex - px);
  }
  const [sx, sy] = pts[0];
  let k = 1;
  let [px, py] = pts[k];
  while (k < pts.length - 1 && Math.hypot(px - sx, py - sy) < span) {
    k++;
    [px, py] = pts[k];
  }
  return Math.atan2(py - sy, px - sx);
}

function samePath(a: Edge, b: Edge): boolean {
  return (!!a.ref && a.ref === b.ref) || (!!a.name && a.name === b.name);
}

/** Lower is better. A driver carries straight on, sticks to the road they are on, and avoids smaller roads. */
function branchScore(from: Edge, cand: Edge): number {
  const turn = angDiff(dirOf(cand.pts, false), dirOf(from.pts, true)); // + = left
  let score = Math.abs(turn) * (180 / Math.PI);
  score += Math.max(0, RANK[cand.cls] - RANK[from.cls]) * 30;
  if (samePath(from, cand)) score -= 45;
  return score;
}

/**
 * Follow the road from the car's position. `headingDeg` is the compass heading of travel (0 = north);
 * pass NaN when it is not known yet and the nearest road is used in whichever direction fits best.
 */
export function followRoad(graph: RoadGraph, pos: LngLat, headingDeg: number, opts: RoamOptions): RoamResult | null {
  if (!graph.edges.length) return null;
  const [x, y] = proj(graph.origin, pos);
  const hd = Number.isFinite(headingDeg) ? compassToDir(headingDeg) : NaN;
  let best: (Proj & { cost: number }) | undefined;
  for (const e of graph.edges) {
    // cheap reject: bounding box with a 60 m margin
    let near = false;
    for (const p of e.pts) {
      if (Math.abs(p[0] - x) < 60 + e.len && Math.abs(p[1] - y) < 60 + e.len) {
        near = true;
        break;
      }
    }
    if (!near) continue;
    const pr = projectOnEdge(e, x, y);
    if (pr.offset > 45) continue;
    let cost = pr.offset;
    if (Number.isFinite(hd)) {
      const d = Math.abs(angDiff(pr.dir, hd));
      if (d > Math.PI / 2) continue; // would be driving against the way
      cost += d * (180 / Math.PI) * 0.35;
    }
    if (!best || cost < best.cost) best = { ...pr, cost };
  }
  if (!best) return null;

  const junctions: { s: number; options: number }[] = [];
  const pts: [number, number][] = [[x, y]];
  const first = best.edge;
  // the part of the first edge still ahead, starting from the snapped point
  let run = 0;
  let started = false;
  const tail: [number, number][] = [];
  for (let i = 1; i < first.pts.length; i++) {
    const [ax, ay] = first.pts[i - 1];
    const [bx, by] = first.pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (!started && run + seg >= best.along) {
      const t = seg > 0 ? (best.along - run) / seg : 0;
      tail.push([ax + t * (bx - ax), ay + t * (by - ay)]);
      started = true;
    }
    if (started) tail.push([bx, by]);
    run += seg;
  }
  // start the line on the road itself, not at the raw GPS point, so the first segment points along the road
  pts.length = 0;
  pts.push(...tail);
  let length = first.len - best.along;
  let cur = first;
  let bias = opts.firstJunctionBias ?? 0;
  const visited = new Set<number>([cur.id]);
  for (let guard = 0; length < opts.lengthM && guard < 500; guard++) {
    const options = (graph.out.get(cur.to) ?? []).filter((id) => id !== cur.twin).map((id) => graph.edges[id]);
    if (!options.length) break;
    let pool = options;
    if (bias && options.length > 1) {
      // the driver steered: only branches on that side (more than about 20 degrees off straight) are considered
      const inDir = dirOf(cur.pts, true);
      const steered = options.filter((o) => angDiff(dirOf(o.pts, false), inDir) * Math.sign(bias) > 0.35);
      if (steered.length) pool = steered;
    }
    const pick = pool.length === 1 ? pool[0] : pool.reduce((a, b) => (branchScore(cur, b) < branchScore(cur, a) ? b : a));
    if (options.length > 1) {
      junctions.push({ s: length, options: options.length });
      bias = 0;
    }
    if (visited.has(pick.id) && visited.size > 60) break; // a loop that never leaves
    visited.add(pick.id);
    for (let i = 1; i < pick.pts.length; i++) pts.push(pick.pts[i]);
    length += pick.len;
    cur = pick;
  }
  return {
    coords: pts.map(([px, py]) => unproj(graph.origin, px, py)),
    offsetM: best.offset,
    junctions,
    road: first.ref || first.name,
  };
}

/** Helpers for planners that work on the same graph (loop builder). */
export function graphPoint(g: RoadGraph, x: number, y: number): LngLat {
  return unproj(g.origin, x, y);
}
export function graphXY(g: RoadGraph, p: LngLat): [number, number] {
  return proj(g.origin, p);
}

/** The closest point on any road within `maxM`, and the compass direction the road runs there (the drawn direction of the edge found). */
export function nearestRoadPoint(g: RoadGraph, p: LngLat, maxM = 400): { point: LngLat; bearingDeg: number; offsetM: number } | null {
  const [x, y] = proj(g.origin, p);
  let best: Proj | null = null;
  for (const e of g.edges) {
    const pr = projectOnEdge(e, x, y);
    if (pr.offset < maxM && (!best || pr.offset < best.offset)) best = pr;
  }
  if (!best) return null;
  let run = 0;
  const pts = best.edge.pts;
  let at: [number, number] = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (run + seg >= best.along || i === pts.length - 1) {
      const t = seg > 0 ? Math.min(1, Math.max(0, (best.along - run) / seg)) : 0;
      at = [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
      break;
    }
    run += seg;
  }
  const bearing = (((90 - (best.dir * 180) / Math.PI) % 360) + 360) % 360;
  return { point: unproj(g.origin, at[0], at[1]), bearingDeg: bearing, offsetM: best.offset };
}
