import { beforeEach, describe, expect, it } from 'vitest';
import { demoStage, generateStage, noteText } from '@/core';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, v),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const { useApp } = await import('./store');
const { useEdits } = await import('./edits');
const { editNote, resetNote, resetAllEdits, correctNearest } = await import('./noteEdits');

const opts = () => ({ dialect: useApp.getState().settings.dialect, units: useApp.getState().settings.units });

beforeEach(() => {
  mem.clear();
  useEdits.setState({ byRoute: {} });
  useApp.getState().setStage(generateStage(demoStage()));
});

describe('saved pacenote edits', () => {
  it('applies an edit to the stage notes and keeps the engine notes underneath', () => {
    const st = useApp.getState().stage!;
    const target = st.baseNotes!.find((n) => n.kind === 'corner')!;
    editNote(target.id, { extra: 'watch the gravel' });
    const after = useApp.getState().stage!;
    expect(noteText(after.notes.find((n) => n.id === target.id)!, opts())).toContain('watch the gravel');
    expect(after.baseNotes!.find((n) => n.id === target.id)!.extra).toBeUndefined();
    expect(mem.get('navi.edits.v1')).toContain('watch the gravel');
  });

  it('re-applies saved edits when the same route is planned again', () => {
    const target = useApp.getState().stage!.baseNotes!.find((n) => n.kind === 'corner')!;
    editNote(target.id, { hidden: true });
    useApp.getState().setStage(generateStage(demoStage()));
    expect(useApp.getState().stage!.notes.some((n) => n.id === target.id)).toBe(false);
  });

  it('puts one note, or all of them, back to the original', () => {
    const corners = useApp.getState().stage!.baseNotes!.filter((n) => n.kind === 'corner');
    editNote(corners[0].id, { hidden: true });
    editNote(corners[1].id, { hidden: true });
    resetNote(corners[0].id);
    expect(useApp.getState().stage!.notes.some((n) => n.id === corners[0].id)).toBe(true);
    resetAllEdits();
    expect(useApp.getState().stage!.notes.length).toBe(useApp.getState().stage!.baseNotes!.length);
  });

  it('a correction while driving makes the corner tighter and says what it did', () => {
    const st = useApp.getState().stage!;
    const c = st.notes.find((n) => n.kind === 'corner' && (n.severity ?? 0) >= 3)!;
    const msg = correctNearest(c.s, true);
    expect(msg).toMatch(/^Saved/);
    const after = useApp.getState().stage!.notes.find((n) => n.id === c.id)!;
    expect(after.severity).toBe((c.severity ?? 4) - 1);
  });

  it('says so when a corner is already as tight as it goes', () => {
    const st = useApp.getState().stage!;
    const c = st.notes.find((n) => n.kind === 'corner')!;
    editNote(c.id, { severity: 1 });
    expect(correctNearest(c.s, true)).toMatch(/already as tight/);
  });
});
