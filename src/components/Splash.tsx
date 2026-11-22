import { useEffect, useState } from 'react';
import { NAVI_DOT, NAVI_GLYPHS, NAVI_STROKE, NAVI_VIEWBOX } from './naviWordmark';

const SEEN = 'navi.splash.seen';

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
}

/** Launch animation: black screen, red outlined Navi, the dot slides in like a rally drift. Shown once per session; tap to skip. */
export function Splash() {
  const [open, setOpen] = useState(() => !alreadySeen());
  useEffect(() => {
    if (!open) return;
    try {
      sessionStorage.setItem(SEEN, '1');
    } catch {
      /* private mode: splash may show again, that's fine */
    }
    const t = window.setTimeout(() => setOpen(false), 2750);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!open) return null;
  const { cx, cy, ln, dh, angle } = NAVI_DOT;
  return (
    <div
      className="navi-splash fixed inset-0 z-50 grid place-items-center bg-black"
      role="img"
      aria-label="Navi"
      onClick={() => setOpen(false)}
    >
      <svg viewBox={NAVI_VIEWBOX} className="w-[84vw] max-w-[640px]" fill="none" overflow="hidden">
        <defs>
          <linearGradient id="navi-streak-g" x1="1" x2="0" y1="0" y2="0">
            <stop offset="0" stopColor="#e41626" stopOpacity="0.9" />
            <stop offset="1" stopColor="#e41626" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="navi-text" stroke="#e41626" strokeWidth={NAVI_STROKE} strokeLinejoin="round">
          {NAVI_GLYPHS.map(([x, d]) => (
            <path key={x} transform={`translate(${x} 0) scale(1 -1)`} d={d} />
          ))}
        </g>
        <g transform={`translate(${cx} ${cy})`}>
          <g className="navi-dot">
            <rect className="navi-streak" x={-ln / 2 - 1500} y={-dh * 0.2} width={1500} height={dh * 0.4} fill="url(#navi-streak-g)" />
            <polygon
              fill="#e41626"
              transform={`rotate(${angle})`}
              points={`${-ln / 2},${-dh / 2} ${ln / 2},${-dh / 2} ${ln / 2},${dh / 2} ${-ln / 2},${dh / 2}`}
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
