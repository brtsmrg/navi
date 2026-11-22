import { median } from './geo';
import type { Path } from './path';
import { severityFromRadius } from './severity';
import type { Corner } from './types';

export interface DetectOptions {
  /** curvature below this is "straight" (1/m). Default 1/500. */
  kappaMin: number;
  /** ignore bends turning less than this unless they are tight. */
  minAngleDeg: number;
  /** same-direction runs closer than this are one corner (m). */
  gapMergeM: number;
}

export const DEFAULT_DETECT: DetectOptions = {
  kappaMin: 1 / 500,
  minAngleDeg: 10,
  gapMergeM: 20,
};

interface Run {
  a: number;
  b: number;
  sgn: 1 | -1;
}

export function detectCorners(path: Path, opts: Partial<DetectOptions> = {}): Corner[] {
  const o = { ...DEFAULT_DETECT, ...opts };
  const { n, ds, s, kappa } = path;

  // 1. sign runs
  let runs: Run[] = [];
  for (let i = 0; i < n; ) {
    const sg = Math.abs(kappa[i]) >= o.kappaMin ? (kappa[i] > 0 ? 1 : -1) : 0;
    if (sg === 0) {
      i++;
      continue;
    }
    let j = i;
    while (
      j + 1 < n &&
      Math.abs(kappa[j + 1]) >= o.kappaMin &&
      (kappa[j + 1] > 0 ? 1 : -1) === sg
    )
      j++;
    runs.push({ a: i, b: j, sgn: sg as 1 | -1 });
    i = j + 1;
  }

  const angleOf = (r: Run) => {
    let sum = 0;
    for (let i = r.a; i <= r.b; i++) sum += kappa[i] * ds;
    return sum;
  };

  // 2. drop digitisation blips (short and almost no turning)
  runs = runs.filter((r) => (r.b - r.a + 1) * ds >= 8 || Math.abs(angleOf(r)) >= (3 * Math.PI) / 180);

  // 3. merge same-direction runs separated by a short gap
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.sgn === r.sgn && (s[r.a] - s[last.b]) <= o.gapMergeM) last.b = r.b;
    else merged.push({ ...r });
  }

  // 4. describe each run
  const corners: Corner[] = [];
  for (const r of merged) {
    const absK: number[] = [];
    for (let i = r.a; i <= r.b; i++) {
      // 3-sample moving average of |kappa|
      const lo = Math.max(r.a, i - 1);
      const hi = Math.min(r.b, i + 1);
      let acc = 0;
      for (let q = lo; q <= hi; q++) acc += Math.abs(kappa[q]);
      absK.push(acc / (hi - lo + 1));
    }
    const peak = Math.max(...absK);
    const apexIdx = r.a + absK.indexOf(peak);
    let radius = 1 / peak;
    if (radius < 45) {
      // The 30 m smoothing window is wider than a tight corner and under-reads
      // it; re-measure the apex on the short window (never below half the coarse value).
      let fine = 0;
      for (let i = r.a; i <= r.b; i++) fine = Math.max(fine, Math.abs(path.kappaFine[i]));
      if (fine > 0) radius = Math.max(radius * 0.5, Math.min(radius, 1 / fine));
    }

    const coreIdx: number[] = [];
    for (let q = 0; q < absK.length; q++) if (absK[q] >= 0.5 * peak) coreIdx.push(r.a + q);
    const first = coreIdx[0];
    const last = coreIdx[coreIdx.length - 1];
    // Entry/exit radii: skip the smoothing ramps at both ends of long runs,
    // then compare the first and last 35% of what remains.
    const skip = Math.round(20 / ds);
    const total = r.b - r.a + 1;
    const inner: number[] = [];
    if (total > 2 * skip + 6) for (let i = r.a + skip; i <= r.b - skip; i++) inner.push(i);
    else inner.push(...coreIdx);
    const take = Math.max(1, Math.round(inner.length * 0.35));
    const entry = median(inner.slice(0, take).map((i) => 1 / absK[i - r.a]));
    const exit = median(inner.slice(-take).map((i) => 1 / absK[i - r.a]));

    const angleDeg = (Math.abs(angleOf(r)) * 180) / Math.PI;
    if (angleDeg < o.minAngleDeg && radius > 100) continue;

    const severity = severityFromRadius(radius);
    const lengthM = s[last] - s[first];
    let shape: Corner['shape'] = 'bend';
    if (angleDeg >= 120 && radius <= 30) shape = 'hairpin';
    else if (angleDeg >= 75 && angleDeg <= 115 && radius <= 25) shape = 'square';
    else if (severity === 6 && angleDeg < 20) shape = 'kink';

    const sevEntry = severityFromRadius(entry);
    const sevExit = severityFromRadius(exit);
    const tightens = shape === 'bend' && sevExit <= sevEntry - 1 && entry / exit >= 1.5;
    const opens = shape === 'bend' && sevExit >= sevEntry + 1 && exit / entry >= 1.5;
    const long = shape === 'bend' && lengthM >= 90 && angleDeg >= 45;

    corners.push({
      id: `c${corners.length}`,
      startS: s[first],
      endS: s[last],
      apexS: s[apexIdx],
      side: r.sgn > 0 ? 'L' : 'R',
      angleDeg,
      radius,
      entryRadius: entry,
      exitRadius: exit,
      severity,
      shape,
      long,
      tightens,
      opens,
    });
  }
  return corners;
}
