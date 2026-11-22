import type { Note } from '@/core';
import { SEV_COLOR } from '@/lib/cn';

/** The corner as it really is: the road sketch, entry heading up, like a road-book diagram. */
export function Glyph({ note, size = 56 }: { note: Note; size?: number }) {
  const g = note.glyph;
  const color = SEV_COLOR[note.severity ?? 4];
  if (!g || g.length < 4) {
    return <div style={{ width: size, height: size }} aria-hidden />;
  }
  const pts: string[] = [];
  for (let i = 0; i < g.length; i += 2) {
    pts.push(`${(10 + g[i] * 80).toFixed(1)},${(90 - g[i + 1] * 80).toFixed(1)}`);
  }
  const d = `M${pts.join('L')}`;
  const [sx, sy] = pts[0].split(',');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Corner sketch" className="shrink-0">
      <path d={d} fill="none" stroke="#0b0d10" strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx} cy={sy} r={5} fill="#e9edf2" />
    </svg>
  );
}
