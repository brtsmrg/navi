import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeCall, gapText, noteText, type DialectId, type Note, type UnitSystem } from '@/core';
import { numberWords, planClips } from './clipPlan';

const manifest = JSON.parse(readFileSync('public/voices/george.json', 'utf8')) as { clips: Record<string, [number, number]> };
const have = (k: string) => k in manifest.clips;

describe('numberWords', () => {
  it('says numbers the way a co-driver does', () => {
    expect(numberWords(50, false)).toEqual(['fifty']);
    expect(numberWords(150, false)).toEqual(['one', 'fifty']);
    expect(numberWords(200, false)).toEqual(['two', 'hundred']);
    expect(numberWords(1500, false)).toEqual(['one', 'thousand', 'five', 'hundred']);
  });
  it('says numbers in plain English when a unit follows', () => {
    expect(numberWords(110, true)).toEqual(['one', 'hundred', 'and', 'ten']);
    expect(numberWords(2000, true)).toEqual(['two', 'thousand']);
  });
});

describe('planClips', () => {
  it('joins words with longer pauses after commas', () => {
    const p = planClips('Left 3 tightens, 150, right 2', have)!;
    expect(p.map((s) => s.key)).toEqual(['left three', 'tightens', 'one fifty', 'right two.']);
    // the comma before "150" is a longer pause than the plain phrase join
    expect(p[2].pauseMs).toBeGreaterThan(p[1].pauseMs);
  });
  it('gives up (so the phone voice is used) on a word it has no recording for', () => {
    expect(planClips('Left 3, watch the cattle grid', have)).toBeNull();
    expect(planClips('Left 3 @ right', have)).toBeNull();
  });
  it('reads the greeting, the sound check and the start count', () => {
    for (const t of ['Navi is on.', 'Sound check. Left three, right three.', '5', 'Go', 'Slow', 'Slow down']) expect(planClips(t, have), t).not.toBeNull();
  });
});

function note(over: Partial<Note>): Note {
  return { id: 'n', kind: 'corner', s: 0, sEnd: 0, side: 'L', severity: 3, mods: {}, ...over } as Note;
}

describe('every call the app can speak has recordings', () => {
  const dialects: DialectId[] = ['rally', 'rally-reverse', 'plain'];
  const unitsList: UnitSystem[] = ['metric', 'imperial'];
  const notes: Note[] = [];
  for (const side of ['L', 'R'] as const)
    for (const severity of [1, 2, 3, 4, 5, 6] as const)
      for (const shape of ['bend', 'hairpin', 'square', 'kink'] as const)
        for (const mods of [{}, { long: true, tightens: true }, { opens: true, caution: true, junction: true }])
          notes.push(note({ side, severity, shape, mods } as Partial<Note>));
  for (const exitCount of [1, 2, 3, 4, 5, 6, 7, 8, 9]) notes.push(note({ kind: 'roundabout', side: undefined, mods: { exitCount } }));
  for (const kind of ['merge', 'uturn', 'exit', 'finish'] as const) for (const side of ['L', 'R', undefined] as const) notes.push(note({ kind, side }));
  for (const sharpness of ['slight', 'normal', 'sharp'] as const) for (const side of ['L', 'R', undefined] as const) notes.push(note({ kind: 'junction', side, mods: { sharpness } }));

  for (const dialect of dialects)
    it(`single notes, ${dialect}`, () => {
      for (const n of notes) {
        const t = noteText(n, { dialect, units: 'metric' });
        expect(planClips(t, have), t).not.toBeNull();
      }
    });

  it('gap words and numbers, every distance a call can contain', () => {
    for (const dialect of dialects)
      for (const units of unitsList)
        for (let m = 0; m <= 6000; m += 5) {
          const t = gapText(m, { dialect, units });
          if (t) expect(planClips(t, have), `${dialect} ${units} ${m}: ${t}`).not.toBeNull();
        }
  });

  it('whole grouped calls with a lead-in', () => {
    const a = note({ s: 0, sEnd: 20 });
    const b = note({ side: 'R', severity: 2, s: 120, sEnd: 140 });
    for (const dialect of dialects) {
      const t = composeCall([a, b], { dialect, units: 'metric' });
      expect(planClips(t, have), t).not.toBeNull();
      expect(planClips(`Caution. ${t}`, have), t).not.toBeNull();
    }
  });
});
