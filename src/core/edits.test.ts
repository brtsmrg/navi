import { describe, expect, it } from 'vitest';
import { applyEdit, applyEdits, correctionTarget, nudgeSeverity, routeKey, without } from './edits';
import { noteText } from './phrase';
import type { Note } from './types';

const corner = (over: Partial<Note> = {}): Note => ({
  id: 'c1', kind: 'corner', s: 100, sEnd: 140, side: 'L', severity: 3, shape: 'bend', mods: {}, ...over,
});
const finish: Note = { id: 'finish', kind: 'finish', s: 900, sEnd: 900, mods: {} };
const o = { dialect: 'plain' as const, units: 'metric' as const };

describe('pacenote edits', () => {
  it('changes severity, side and modifiers without mutating the original', () => {
    const n = corner();
    const e = applyEdit(n, { severity: 1, side: 'R', long: true });
    expect(e.severity).toBe(1);
    expect(e.side).toBe('R');
    expect(e.mods.long).toBe(true);
    expect(n.severity).toBe(3);
    expect(n.mods.long).toBeUndefined();
  });

  it('turns a named hairpin into a plain numbered bend when the number is edited', () => {
    const e = applyEdit(corner({ shape: 'hairpin', severity: 1 }), { severity: 4 });
    expect(e.shape).toBe('bend');
    expect(noteText(e, o)).toBe('Medium left');
  });

  it('makes level 1 a hairpin', () => {
    expect(noteText(applyEdit(corner({ severity: 3 }), { severity: 1 }), o)).toBe('Hairpin left');
  });

  it('speaks the driver words after the call', () => {
    const e = applyEdit(corner(), { extra: ' watch the gravel ' });
    expect(noteText(e, o)).toBe('Medium left, watch the gravel');
  });

  it('caps the extra words at 40 characters', () => {
    const e = applyEdit(corner(), { extra: 'x'.repeat(80) });
    expect(e.extra?.length).toBe(40);
  });

  it('drops skipped calls but never the finish', () => {
    const notes = [corner(), corner({ id: 'c2', s: 200 }), finish];
    const out = applyEdits(notes, { c1: { hidden: true }, finish: { hidden: true } });
    expect(out.map((n) => n.id)).toEqual(['c2', 'finish']);
  });

  it('leaves notes alone when there are no edits', () => {
    const notes = [corner()];
    expect(applyEdits(notes, undefined)).toBe(notes);
    expect(applyEdit(finish, { severity: 1 })).toBe(finish);
  });

  it('builds the same route key for the same route and a different one otherwise', () => {
    const a: [number, number][] = [[1, 2], [1.1, 2.1], [1.2, 2.2]];
    expect(routeKey(a)).toBe(routeKey([...a]));
    expect(routeKey(a)).not.toBe(routeKey([[1, 2], [1.1, 2.1], [1.3, 2.3]]));
  });

  it('removes fields from an edit and reports an empty one as gone', () => {
    expect(without({ severity: 2, long: true }, 'long')).toEqual({ severity: 2 });
    expect(without({ long: true }, 'long')).toBeUndefined();
  });

  it('nudges severity one step and stops at the ends', () => {
    expect(nudgeSeverity(3, true)).toBe(2);
    expect(nudgeSeverity(3, false)).toBe(4);
    expect(nudgeSeverity(1, true)).toBeNull();
    expect(nudgeSeverity(6, false)).toBeNull();
  });

  it('picks the corner the driver is in or has just passed', () => {
    const notes = [corner({ id: 'a', s: 100 }), corner({ id: 'b', s: 300 }), corner({ id: 'c', s: 500 })];
    expect(correctionTarget(notes, 320)?.id).toBe('b');
    expect(correctionTarget(notes, 290)?.id).toBe('b');
    expect(correctionTarget(notes, 50)).toBeUndefined();
  });
});
