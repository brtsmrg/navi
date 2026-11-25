import { RouteTracker } from './tracker';
import type { HazardKind, Note, LngLat } from './types';
import type { Stage } from './index';

export interface Hazard {
  lng: number;
  lat: number;
  kind: HazardKind;
}

/**
 * Add "Bump", "Rail crossing", "Speed camera" and "Narrows" calls from map points that sit on the road ahead.
 * A point counts when it is within `maxOffM` of the route; two of the same kind within 40 m count once.
 * The stage keeps every other note exactly as it was.
 */
export function addHazards(stage: Stage, hazards: Hazard[], maxOffM = 12): Stage {
  if (!hazards.length || stage.path.length < 2) return stage;
  const coords: LngLat[] = stage.route.coords;
  const tracker = new RouteTracker(coords);
  const found: { s: number; kind: HazardKind }[] = [];
  for (const h of hazards) {
    const snap = tracker.snap(h.lng, h.lat);
    if (snap.offsetM > maxOffM) continue;
    if (snap.s < 15 || snap.s > tracker.length - 15) continue;
    if (found.some((f) => f.kind === h.kind && Math.abs(f.s - snap.s) < 40)) continue;
    found.push({ s: snap.s, kind: h.kind });
  }
  if (!found.length) return stage;
  const mk = (f: { s: number; kind: HazardKind }): Note => ({ id: `hz-${f.kind}-${Math.round(f.s)}`, kind: 'hazard', hazard: f.kind, s: f.s, sEnd: f.s, mods: {} });
  const base = stage.notes.filter((n) => n.kind !== 'hazard');
  const notes = [...base, ...found.map(mk)].sort((a, b) => (a.kind === 'finish' ? 1 : b.kind === 'finish' ? -1 : a.s - b.s));
  return { ...stage, notes, baseNotes: notes, stats: { ...stage.stats, noteCount: notes.length } };
}
