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

const ORD: Record<string, string> = { '1st': '1st', '2nd': '2nd', '3rd': '3rd', '4th': '4th', '5th': '5th', '6th': '6th', '7th': '7th', '8th': '8th', '9th': '9th' };
const PAUSE = { word: 30, comma: 190, stop: 330 };

/** Plan the clips for a call. `have` is the set of keys the voice pack contains. */
export function planClips(text: string, have: (key: string) => boolean): ClipStep[] | null {
  const steps: ClipStep[] = [];
  const re = /([,.;:!?]*)\s*([a-z0-9]+(?:-[a-z]+)?)/gi;
  let first = true;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(text)) !== null) {
    // anything between matches other than spaces and punctuation means text we cannot read
    if (/[^\s,.;:!?]/.test(text.slice(consumed, m.index))) return null;
    consumed = m.index + m[0].length;
    const punct = m[1];
    let pause = /[.!?]/.test(punct) ? PAUSE.stop : punct ? PAUSE.comma : PAUSE.word;
    if (first) pause = 0;
    const tok = m[2].toLowerCase();
    let keys: string[];
    if (/^\d+$/.test(tok)) {
      const next = text.slice(consumed).trim().toLowerCase();
      const plain = /^(metres|meters|feet)\b/.test(next);
      keys = numberWords(Number(tok), plain);
      if (!keys.length) return null;
    } else if (ORD[tok]) keys = [ORD[tok]];
    else keys = [tok];
    for (let i = 0; i < keys.length; i++) {
      if (!have(keys[i])) return null;
      steps.push({ key: keys[i], pauseMs: i === 0 ? pause : 25 });
    }
    first = false;
  }
  if (/[^\s,.;:!?]/.test(text.slice(consumed))) return null;
  return steps.length ? steps : null;
}
