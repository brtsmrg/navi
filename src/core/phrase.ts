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

/** Words for one note (no distances), with any words the driver added. */
export function noteText(n: Note, o: PhraseOptions): string {
  const base = baseNoteText(n, o);
  return n.extra && n.kind !== 'finish' ? `${base}, ${n.extra}` : base;
}

function baseNoteText(n: Note, o: PhraseOptions): string {
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
  // close together: "into" for a link, and in plain English no connecting word at all, just a pause
  // (a spoken "then" after every corner sounds stilted)
  if (gapM < 25) return 'into';
  if (gapM < 50) return plain ? '' : 'and';
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
    acc += g === '' ? `, ${lc}` : /^(into|and|then)$/.test(g) ? ` ${g} ${lc}` : `, ${g}, ${lc}`;
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

export interface FullLabel {
  dir?: 'L' | 'R';
  /** "Sharp left", "Hairpin right", "Roundabout, 2nd exit": never abbreviated. */
  headline: string;
  /** "long, tightens": the modifiers in words. */
  detail: string;
}

/** On-screen label in plain words, for drivers who do not want to decode L4, R2, H or SQ. */
export function fullLabel(n: Note): FullLabel {
  const detail: string[] = [];
  if (n.mods.caution) detail.push('careful');
  if (n.mods.long) detail.push('long');
  if (n.mods.tightens) detail.push('tightens');
  if (n.mods.opens) detail.push('opens');
  const det = detail.join(', ');
  const side = n.side ? sideWord(n.side) : '';
  const out = (headline: string): FullLabel => ({ dir: n.side, headline, detail: det });
  switch (n.kind) {
    case 'finish': return out('Arrive');
    case 'roundabout': return out(`Roundabout, ${ordinal(n.mods.exitCount ?? 1)} exit`);
    case 'merge': return out('Merge');
    case 'uturn': return out(`U-turn${side ? ` ${side}` : ''}`);
    case 'exit': return out(side ? `Exit ${side}` : 'Exit');
    case 'junction': {
      const sh = n.mods.sharpness && n.mods.sharpness !== 'normal' ? `${n.mods.sharpness} ` : '';
      return out(cap(`turn ${sh}${side || 'ahead'}`));
    }
    default:
      break;
  }
  if (n.shape === 'hairpin') return out(`Hairpin ${side}`);
  if (n.shape === 'square') return out(`Right-angle ${side}`);
  if (n.shape === 'kink') return out(cap(`slight ${side}`));
  return out(cap(`${PLAIN_WORD[n.severity ?? 4]} ${side}`));
}

let estimator: ((text: string, rate: number) => number | null) | undefined;
/** Lets a voice that knows its own timing (recorded clips) replace the rough estimate below. */
export function setSpeechEstimator(fn: ((text: string, rate: number) => number | null) | undefined): void {
  estimator = fn;
}

/** Rough speech duration (ms). English TTS runs near 2.7-3 words per second at rate 1. */
export function estimateSpeechMs(text: string, rate = 1): number {
  const exact = estimator?.(text, rate);
  if (exact != null) return exact;
  const words = text.split(/[\s,]+/).filter(Boolean).length;
  return Math.round((words * 340 + 200) / Math.max(0.5, rate));
}
