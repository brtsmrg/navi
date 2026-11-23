import type { LngLat, Note, Severity, Side } from './types';

/** What a driver changed about one pacenote. Anything left out keeps the engine's value. */
export interface NoteEdit {
  severity?: Severity;
  side?: Side;
  long?: boolean;
  tightens?: boolean;
  opens?: boolean;
  caution?: boolean;
  /** Words added to the call, e.g. "watch the gravel". */
  extra?: string;
  /** Skip this call (the corner stays on the route, it is just not called). */
  hidden?: boolean;
}

/** Edits for one route, keyed by note id. */
export type EditMap = Record<string, NoteEdit>;

export const MAX_EXTRA = 40;

export function isEmptyEdit(e: NoteEdit | undefined): boolean {
  return !e || Object.keys(e).length === 0;
}

/** Apply one edit to one note. Never mutates. */
export function applyEdit(n: Note, e: NoteEdit | undefined): Note {
  if (!e || n.kind === 'finish') return n;
  const out: Note = { ...n, mods: { ...n.mods } };
  if (e.side && out.side) out.side = e.side;
  if (e.severity && out.kind === 'corner') {
    out.severity = e.severity;
    // the tightest level is the hairpin; any other level replaces a named shape that would hide the number
    if (e.severity === 1) out.shape = 'hairpin';
    else if (out.shape === 'hairpin' || out.shape === 'square' || out.shape === 'kink') out.shape = 'bend';
  }
  for (const k of ['long', 'tightens', 'opens', 'caution'] as const) {
    if (e[k] !== undefined) out.mods[k] = e[k];
  }
  if (e.extra && e.extra.trim()) out.extra = e.extra.trim().slice(0, MAX_EXTRA);
  return out;
}

/** The note list a ride should use: edits applied, skipped calls removed. */
export function applyEdits(notes: Note[], edits: EditMap | undefined): Note[] {
  if (!edits) return notes;
  const out: Note[] = [];
  for (const n of notes) {
    const e = edits[n.id];
    if (e?.hidden && n.kind !== 'finish') continue;
    out.push(applyEdit(n, e));
  }
  return out;
}

/** A stable id for a route so edits survive reloads. Same coordinates, same key. */
export function routeKey(coords: LngLat[]): string {
  const r = (v: number) => v.toFixed(4);
  const pt = (c: LngLat | undefined) => (c ? `${r(c[0])},${r(c[1])}` : '-');
  const mid = coords[Math.floor(coords.length / 2)];
  return `${coords.length}|${pt(coords[0])}|${pt(mid)}|${pt(coords[coords.length - 1])}`;
}

/** Remove a field from an edit; returns undefined when nothing is left. */
export function without(e: NoteEdit | undefined, ...keys: (keyof NoteEdit)[]): NoteEdit | undefined {
  if (!e) return undefined;
  const next = { ...e };
  for (const k of keys) delete next[k];
  return isEmptyEdit(next) ? undefined : next;
}

/** Tighter = a lower number (1 is the tightest). Returns null when already at the limit. */
export function nudgeSeverity(sev: Severity, tighter: boolean): Severity | null {
  const next = sev + (tighter ? -1 : 1);
  return next >= 1 && next <= 6 ? (next as Severity) : null;
}

/** The corner a driver is correcting: the last one at or just ahead of where they are. */
export function correctionTarget(notes: Note[], s: number): Note | undefined {
  let found: Note | undefined;
  for (const n of notes) {
    if (n.kind !== 'corner') continue;
    if (n.s <= s + 15) found = n;
    else break;
  }
  return found;
}

/** Accept edits from outside (a shared link) only if every field is one we know and the values are sane. */
export function sanitizeEdits(input: unknown): EditMap {
  const out: EditMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [id, raw] of Object.entries(input as Record<string, unknown>).slice(0, 200)) {
    if (!/^[\w-]{1,24}$/.test(id)) continue;
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const e: NoteEdit = {};
    if (typeof r.severity === 'number' && Number.isInteger(r.severity) && r.severity >= 1 && r.severity <= 6) e.severity = r.severity as Severity;
    if (r.side === 'L' || r.side === 'R') e.side = r.side;
    for (const k of ['long', 'tightens', 'opens', 'caution', 'hidden'] as const) if (typeof r[k] === 'boolean') e[k] = r[k] as boolean;
    if (typeof r.extra === 'string' && r.extra.trim()) e.extra = r.extra.replace(/[<>]/g, '').trim().slice(0, MAX_EXTRA);
    if (!isEmptyEdit(e)) out[id] = e;
  }
  return out;
}
