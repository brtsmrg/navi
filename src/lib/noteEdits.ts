import { correctionTarget, isEmptyEdit, noteText, nudgeSeverity, type NoteEdit } from '@/core';
import { useEdits } from '@/lib/edits';
import { useApp } from '@/lib/store';

/** Re-apply saved edits to the stage on screen (and, through the ride controller, to a ride in progress). */
function refresh() {
  const st = useApp.getState();
  if (st.stage) st.setStage(st.stage);
}

function current(noteId: string): NoteEdit | undefined {
  const key = useApp.getState().stage?.key;
  return key ? useEdits.getState().byRoute[key]?.[noteId] : undefined;
}

/** Merge a change into one note's edit and save it. Passing undefined for a field removes that change. */
export function editNote(noteId: string, patch: Partial<Record<keyof NoteEdit, NoteEdit[keyof NoteEdit] | undefined>>): void {
  const key = useApp.getState().stage?.key;
  if (!key) return;
  const next: Record<string, unknown> = { ...(current(noteId) ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') delete next[k];
    else next[k] = v;
  }
  useEdits.getState().put(key, noteId, isEmptyEdit(next as NoteEdit) ? undefined : (next as NoteEdit));
  refresh();
}

export function resetNote(noteId: string): void {
  const key = useApp.getState().stage?.key;
  if (!key) return;
  useEdits.getState().put(key, noteId, undefined);
  refresh();
}

export function resetAllEdits(): void {
  const key = useApp.getState().stage?.key;
  if (!key) return;
  useEdits.getState().clearRoute(key);
  refresh();
}

/** Driver correction from the ride screen: the corner you just drove was tighter or easier than called. */
export function correctNearest(s: number, tighter: boolean): string {
  const stage = useApp.getState().stage;
  if (!stage) return '';
  const n = correctionTarget(stage.notes, s);
  if (!n || !n.severity) return 'No corner to correct yet.';
  const next = nudgeSeverity(n.severity, tighter);
  if (!next) return tighter ? 'That corner is already as tight as it goes.' : 'That corner is already the easiest number.';
  editNote(n.id, { severity: next });
  const st = useApp.getState();
  const after = st.stage?.notes.find((x) => x.id === n.id);
  const words = after ? noteText(after, { dialect: st.settings.dialect, units: st.settings.units }) : `severity ${next}`;
  return `Saved: now “${words}”. Navi will call it that way from here on.`;
}
