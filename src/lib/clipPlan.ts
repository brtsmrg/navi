/**
 * Turns a spoken call ("Left 3 tightens, 150, right 2") into a list of recorded words, or null when
 * any word has no recording (a driver's own typed note, say). Pure, so it runs in tests and in node.
 */

export interface ClipStep {
  /** Key in the voice pack manifest. */
  key: string;
  /** Silence before this word, in milliseconds. */
  pauseMs: number;
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below100(n: number): string[] {
  if (n < 20) return n ? [ONES[n]] : [];
  return [TENS[Math.floor(n / 10)], ...(n % 10 ? [ONES[n % 10]] : [])];
}

/**
 * Number as words. Co-driver style says "one fifty" and "two hundred"; plain English says
 * "one hundred and fifty". Plain English is used when the number is followed by a unit.
 */
export function numberWords(n: number, plain: boolean): string[] {
  if (!Number.isFinite(n) || n < 0 || n > 99999) return [];
  n = Math.round(n);
  if (n === 0) return ['zero'];
  const out: string[] = [];
  const th = Math.floor(n / 1000);
  let rest = n % 1000;
  if (th) {
    out.push(...below100(th), 'thousand');
    if (!rest) return out;
    if (plain && rest < 100) out.push('and');
  }
  const h = Math.floor(rest / 100);
  rest %= 100;
  if (h) {
    out.push(ONES[h], 'hundred');
    if (rest && plain) out.push('and', ...below100(rest));
    else if (rest) out.push(...below100(rest));
  } else if (rest) out.push(...below100(rest));
  // rally style: "one fifty" rather than "one hundred fifty"
  if (!plain && h && rest) out.splice(out.indexOf('hundred'), 1);
  return out;
}

const ORD_WORD: Record<string, string> = { '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth', '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth' };
/** Silence between clips, in milliseconds. Phrases within one breath sit close together. */
const PAUSE = { phrase: 45, comma: 120, stop: 320 };
const MAX_PHRASE = 9;

interface Tok {
  word: string;
  /** punctuation just before this word */
  punct: string;
}

function tokenize(text: string): Tok[] | null {
  const toks: Tok[] = [];
  const re = /([,.;:!?]*)\s*([a-z0-9]+(?:-[a-z]+)?)/gi;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // anything between matches other than spaces and punctuation is text we cannot read
    if (/[^\s,.;:!?]/.test(text.slice(consumed, m.index))) return null;
    consumed = m.index + m[0].length;
    const tok = m[2].toLowerCase();
    let words: string[];
    if (/^\d+$/.test(tok)) {
      const next = text.slice(consumed).trim().toLowerCase();
      words = numberWords(Number(tok), /^(metres|meters|feet)\b/.test(next));
      if (!words.length) return null;
    } else if (ORD_WORD[tok]) words = [ORD_WORD[tok]];
    else words = [tok];
    words.forEach((w, i) => toks.push({ word: w, punct: i === 0 ? m![1] : '' }));
  }
  if (/[^\s,.;:!?]/.test(text.slice(consumed))) return null;
  return toks.length ? toks : null;
}

/**
 * Plan the clips for a call. `have` says which keys the voice pack contains. Words are grouped into the
 * longest recorded phrases first ("left three", "then in one hundred metres"), single words last, so
 * a call keeps the rhythm of a person reading it. The last phrase uses its "final" take (key + '.').
 */
export function planClips(text: string, have: (key: string) => boolean): ClipStep[] | null {
  const toks = tokenize(text);
  if (!toks) return null;
  const steps: ClipStep[] = [];
  let i = 0;
  while (i < toks.length) {
    // a phrase never runs across a comma or full stop
    let end = i + 1;
    while (end < toks.length && !toks[end].punct && end - i < MAX_PHRASE) end++;
    let len = end - i;
    let key = '';
    for (; len >= 1; len--) {
      key = toks.slice(i, i + len).map((t) => t.word).join(' ');
      if (have(key)) break;
    }
    if (len < 1) return null;
    const p = toks[i].punct;
    steps.push({ key, pauseMs: i === 0 ? 0 : /[.!?]/.test(p) ? PAUSE.stop : p ? PAUSE.comma : PAUSE.phrase });
    i += len;
  }
  const last = steps[steps.length - 1];
  if (have(`${last.key}.`)) last.key = `${last.key}.`;
  return steps.length ? steps : null;
}
