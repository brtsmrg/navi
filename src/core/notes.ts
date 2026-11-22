import { cornerSpeedMps, kmh, PROFILE_G } from './severity';
import type { Path } from './path';
import { indexAt } from './path';
import type { Corner, EdgeAttr, Maneuver, Note, StageStats } from './types';

export interface NoteOptions {
  /** include severity-6 bends that turn at least 20 degrees (always) and kinks (if true) */
  callFlats: boolean;
  /** approach length (m) after which a severe corner earns a static "caution" */
  cautionApproachM: number;
}

export const DEFAULT_NOTE_OPTIONS: NoteOptions = { callFlats: false, cautionApproachM: 150 };

/** Road sketch normalised to 0..1 with the entry heading pointing up. */
function glyphFor(path: Path, startS: number, endS: number, padM = 25): number[] {
  const a = indexAt(path, Math.max(0, startS - padM));
  const b = indexAt(path, Math.min(path.length, endS + padM));
  if (b - a < 2) return [];
  const rot = Math.PI / 2 - path.heading[a];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pts: [number, number][] = [];
  for (let i = a; i <= b; i++) {
    const dx = path.x[i] - path.x[a];
    const dy = path.y[i] - path.y[a];
    pts.push([dx * c - dy * s, dx * s + dy * c]);
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const offX = (span - (maxX - minX)) / 2;
  const offY = (span - (maxY - minY)) / 2;
  // thin out to <= 40 points
  const step = Math.max(1, Math.floor(pts.length / 40));
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += step) {
    out.push(
      Math.round(((pts[i][0] - minX + offX) / span) * 1000) / 1000,
      Math.round(((pts[i][1] - minY + offY) / span) * 1000) / 1000,
    );
  }
  const last = pts[pts.length - 1];
  out.push(
    Math.round(((last[0] - minX + offX) / span) * 1000) / 1000,
    Math.round(((last[1] - minY + offY) / span) * 1000) / 1000,
  );
  return out;
}

function limitAt(edges: EdgeAttr[] | undefined, s: number): number | undefined {
  if (!edges) return undefined;
  for (const e of edges) if (s >= e.fromS && s <= e.toS) return e.speedLimit;
  return undefined;
}

export function buildNotes(
  path: Path,
  corners: Corner[],
  maneuvers: Maneuver[] = [],
  edges: EdgeAttr[] | undefined,
  opts: Partial<NoteOptions> = {},
): Note[] {
  const o = { ...DEFAULT_NOTE_OPTIONS, ...opts };
  const notes: Note[] = [];

  // Roundabouts suppress the circular geometry inside them.
  const roundZones: [number, number][] = [];
  for (const m of maneuvers) {
    if (m.kind !== 'roundabout') continue;
    const s0 = path.srcS[Math.min(m.shapeIndex, path.srcS.length - 1)];
    const s1 = path.srcS[Math.min(m.endShapeIndex ?? m.shapeIndex + 1, path.srcS.length - 1)];
    roundZones.push([s0 - 5, Math.max(s1, s0 + 10) + 5]);
    notes.push({
      id: `r${notes.length}`,
      kind: 'roundabout',
      s: s0,
      sEnd: Math.max(s1, s0 + 10),
      mods: { exitCount: m.exitCount },
      limitKmh: limitAt(edges, s0),
    });
  }

  const usable = corners.filter(
    (c) =>
      !roundZones.some(([a, b]) => c.apexS >= a && c.apexS <= b) &&
      (o.callFlats || c.severity < 6 || c.angleDeg >= 20),
  );

  const flagged = new Set<string>();
  for (const m of maneuvers) {
    if (m.kind === 'roundabout') continue;
    const s0 = path.srcS[Math.min(m.shapeIndex, path.srcS.length - 1)];
    if (s0 <= 1 || s0 >= path.length - 1) continue;
    const hit = usable.find((c) => s0 >= c.startS - 15 && s0 <= c.endS + 15);
    if (hit && (m.kind === 'turn' || m.kind === 'uturn')) {
      flagged.add(hit.id);
      continue;
    }
    notes.push({
      id: `m${notes.length}`,
      kind: m.kind === 'other' || m.kind === 'turn' ? 'junction' : m.kind,
      s: s0,
      sEnd: s0,
      side: m.side,
      mods: { sharpness: m.sharpness },
      limitKmh: limitAt(edges, s0),
    });
  }

  usable.forEach((c, idx) => {
    const prevEnd = idx === 0 ? 0 : usable[idx - 1].endS;
    const approach = c.startS - prevEnd;
    const severe = c.severity <= 2 || c.shape === 'hairpin';
    const caution =
      (severe && approach >= o.cautionApproachM) || (c.tightens && c.severity <= 2);
    notes.push({
      id: c.id,
      kind: 'corner',
      s: c.startS,
      sEnd: c.endS,
      apexS: c.apexS,
      side: c.side,
      severity: c.severity,
      shape: c.shape,
      angleDeg: c.angleDeg,
      radius: c.radius,
      mods: {
        long: c.long,
        tightens: c.tightens,
        opens: c.opens,
        caution,
        junction: flagged.has(c.id),
      },
      glyph: glyphFor(path, c.startS, c.endS),
      limitKmh: limitAt(edges, c.startS),
    });
  });

  notes.push({
    id: 'finish',
    kind: 'finish',
    s: path.length,
    sEnd: path.length,
    mods: {},
  });

  notes.sort((a, b) => a.s - b.s);
  return notes;
}

/** 0-100. Heuristic: 1 - exp(-degreesPerKm / 350). 900 deg/km (a mountain pass) scores ~92. */
export function twistScore(degreesPerKm: number): number {
  return Math.round(100 * (1 - Math.exp(-degreesPerKm / 350)));
}

export function computeStats(path: Path, corners: Corner[], notes: Note[]): StageStats {
  const bySeverity: StageStats['bySeverity'] = [0, 0, 0, 0, 0, 0];
  let totalDeg = 0;
  let hairpins = 0;
  for (const c of corners) {
    bySeverity[c.severity - 1]++;
    totalDeg += c.angleDeg;
    if (c.shape === 'hairpin') hairpins++;
  }
  let longest = 0;
  let prev = 0;
  for (const c of corners) {
    longest = Math.max(longest, c.startS - prev);
    prev = c.endS;
  }
  longest = Math.max(longest, path.length - prev);
  const km = path.length / 1000;
  const dpk = km > 0 ? totalDeg / km : 0;
  return {
    distanceM: path.length,
    cornerCount: corners.length,
    hairpins,
    bySeverity,
    degreesPerKm: dpk,
    twistScore: twistScore(dpk),
    longestStraightM: longest,
    noteCount: notes.length,
  };
}

/** Speed (km/h) a driver profile can comfortably carry through a note. */
export function noteSpeedKmh(n: Note, profile: keyof typeof PROFILE_G): number | undefined {
  if (n.radius === undefined) return undefined;
  return kmh(cornerSpeedMps(n.radius, PROFILE_G[profile]));
}
