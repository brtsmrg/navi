import type { DialectId, Note, Severity, UnitSystem } from './types';

export interface PhraseOptions {
  dialect: DialectId;
  units: UnitSystem;
}

export interface Dialect {
  id: DialectId;
  name: string;
  blurb: string;
}

export const DIALECTS: Dialect[] = [
  { id: 'rally', name: 'Co-driver', blurb: 'Left 4 long, 100, right 3. 1 = tightest, 6 = flat.' },
  { id: 'rally-reverse', name: 'Co-driver (reversed)', blurb: 'Same calls, 6 = tightest, 1 = flat.' },
  { id: 'plain', name: 'Plain English', blurb: 'Sharp left, then in 100 metres, easy right.' },
];

const sideWord = (s: 'L' | 'R') => (s === 'L' ? 'left' : 'right');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const ordinal = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10] ?? 'th'}`;
};

/** Number spoken for a severity under a dialect. */
export function severityNumber(sev: Severity, dialect: DialectId): number {
  return dialect === 'rally-reverse' ? 7 - sev : sev;
}

const PLAIN_WORD: Record<Severity, string> = {
  1: 'sharp',
  2: 'sharp',
  3: 'medium',
  4: 'medium',
  5: 'easy',
  6: 'slight',
};

/** Words for one note (no distances). */
export function noteText(n: Note, o: PhraseOptions): string {
  const plain = o.dialect === 'plain';
  const parts: string[] = [];

  if (n.kind === 'finish') return plain ? 'Arrive' : 'Finish';
  if (n.kind === 'roundabout') {
    const e = n.mods.exitCount ?? 1;
    return plain ? `Roundabout, take the ${ordinal(e)} exit` : `Roundabout exit ${e}`;
  }
  if (n.kind === 'merge') return 'Merge';
  if (n.kind === 'uturn') return 'U-turn';
  if (n.kind === 'exit') return n.side ? `Exit ${sideWord(n.side)}` : 'Exit';
  if (n.kind === 'junction') {
    const sh = n.mods.sharpness && n.mods.sharpness !== 'normal' ? `${n.mods.sharpness} ` : '';
    const dir = n.side ? sideWord(n.side) : 'ahead';
    return plain ? `Turn ${sh}${dir}` : `Junction ${sh}${dir}`;
  }

  // corner
  const side = sideWord(n.side ?? 'L');
  const head = n.mods.caution ? (plain ? 'careful, ' : 'caution, ') : '';
  if (n.mods.junction) parts.push('junction');
  if (n.shape === 'hairpin') parts.push(`hairpin ${side}`);
  else if (n.shape === 'square') parts.push(plain ? `right-angle ${side}` : `square ${side}`);
  else if (n.shape === 'kink') parts.push(plain ? `slight ${side}` : `${side} kink`);
  else {
    const sev = n.severity ?? 4;
    parts.push(plain ? `${PLAIN_WORD[sev]} ${side}` : `${side} ${severityNumber(sev, o.dialect)}`);
  }
  if (n.mods.long) parts.push('long');
  if (n.mods.tightens) parts.push(plain ? 'tightening' : 'tightens');
  if (n.mods.opens) parts.push(plain ? 'opening' : 'opens');
  return cap(head + parts.join(' '));
}

/** Round a gap the way a co-driver would. Returns metres. */
export function roundGap(m: number): number {
  if (m < 150) return Math.round(m / 10) * 10;
  if (m < 400) return Math.round(m / 50) * 50;
  return Math.round(m / 100) * 100;
}

const M_TO_FT = 3.28084;

/** Connector spoken between two notes `gapM` apart. */
export function gapText(gapM: number, o: PhraseOptions): string {
  const plain = o.dialect === 'plain';
  if (gapM < 25) return plain ? 'then' : 'into';
  if (gapM < 50) return plain ? 'then' : 'and';
  const r = roundGap(gapM);
  if (o.units === 'imperial') {
    const ft = Math.round((r * M_TO_FT) / 50) * 50;
    return plain ? `then in ${ft} feet` : `${ft}`;
  }
  return plain ? `then in ${r} metres` : `${r}`;
}

/** Full spoken call for a group of consecutive notes. */
export function composeCall(notes: Note[], o: PhraseOptions): string {
  let acc = '';
  notes.forEach((n, i) => {
    const t = noteText(n, o);
    if (i === 0) {
      acc = t;
      return;
    }
    const g = gapText(n.s - notes[i - 1].sEnd, o);
    const lc = `${t.charAt(0).toLowerCase()}${t.slice(1)}`;
    acc += /^(into|and|then)$/.test(g) ? ` ${g} ${lc}` : `, ${g}, ${lc}`;
  });
  return acc;
}

/** Compact label for UI chips. */
export function noteLabel(n: Note, o: PhraseOptions): { dir?: 'L' | 'R'; num: string; mods: string[] } {
  const mods: string[] = [];
  if (n.mods.caution) mods.push('!');
  if (n.mods.long) mods.push('long');
  if (n.mods.tightens) mods.push('tightens');
  if (n.mods.opens) mods.push('opens');
  if (n.kind === 'corner') {
    if (n.shape === 'hairpin') return { dir: n.side, num: 'H', mods };
    if (n.shape === 'square') return { dir: n.side, num: 'SQ', mods };
    if (n.shape === 'kink') return { dir: n.side, num: 'K', mods };
    return { dir: n.side, num: String(severityNumber(n.severity ?? 4, o.dialect)), mods };
  }
  if (n.kind === 'roundabout') return { num: `R${n.mods.exitCount ?? ''}`, mods };
  if (n.kind === 'finish') return { num: 'END', mods };
  if (n.kind === 'junction') return { dir: n.side, num: 'J', mods };
  if (n.kind === 'uturn') return { dir: n.side, num: 'U', mods };
  if (n.kind === 'merge') return { num: 'M', mods };
  return { dir: n.side, num: 'X', mods };
}

/** Rough speech duration (ms). English TTS runs near 2.7-3 words per second at rate 1. */
export function estimateSpeechMs(text: string, rate = 1): number {
  const words = text.split(/[\s,]+/).filter(Boolean).length;
  return Math.round((words * 340 + 200) / Math.max(0.5, rate));
}
