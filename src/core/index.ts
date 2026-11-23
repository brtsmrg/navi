import { detectCorners, type DetectOptions } from './corners';
import { buildNotes, computeStats, type NoteOptions } from './notes';
import { routeKey } from './edits';
import { resample, type Path } from './path';
import type { Corner, Note, Route, StageStats } from './types';

export * from './types';
export * from './geo';
export * from './path';
export * from './corners';
export * from './notes';
export * from './phrase';
export * from './severity';
export * from './scheduler';
export * from './tracker';
export * from './sim';
export * from './synth';
export * from './units';
export * from './edits';

export interface Stage {
  route: Route;
  path: Path;
  corners: Corner[];
  notes: Note[];
  /** Notes as the engine wrote them, before any driver edits. */
  baseNotes?: Note[];
  /** Identifies this route so edits can be saved against it. */
  key?: string;
  stats: StageStats;
}

export interface StageOptions {
  stepM: number;
  detect: Partial<DetectOptions>;
  notes: Partial<NoteOptions>;
}

/** Route in, pacenotes out. */
export function generateStage(route: Route, opts: Partial<StageOptions> = {}): Stage {
  const path = resample(route.coords, opts.stepM ?? 5);
  const corners = detectCorners(path, opts.detect);
  const notes = buildNotes(path, corners, route.maneuvers, route.edges, opts.notes);
  return { route, path, corners, notes, baseNotes: notes, key: routeKey(route.coords), stats: computeStats(path, corners, notes) };
}
export * from './traffic';
