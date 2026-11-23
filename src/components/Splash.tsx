import { useEffect, useState } from 'react';
import { NAVI_LETTERS, NAVI_STOP, NAVI_VIEWBOX } from './naviWordmark';

const SEEN = 'navi.splash.seen';

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
}

/** Launch animation: black screen, white Navi wipes in, the red full stop slides in like a rally drift and lands. Shown once per session; tap to skip. */
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
  return (
    <div
      className="navi-splash fixed inset-0 z-50 grid place-items-center bg-black"
      role="img"
      aria-label="Navi"
      onClick={() => setOpen(false)}
    >
      <svg viewBox={NAVI_VIEWBOX} className="w-[78vw] max-w-[620px]" overflow="hidden">
        <defs>
          <linearGradient id="navi-streak-g" x1="1" x2="0" y1="0" y2="0">
            <stop offset="0" stopColor="#e41626" stopOpacity="0.9" />
            <stop offset="1" stopColor="#e41626" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="navi-text" fill="#fff">
          {NAVI_LETTERS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g className="navi-dot">
          <rect className="navi-streak" x={120} y={-62} width={1500} height={36} fill="url(#navi-streak-g)" />
          <path d={NAVI_STOP} fill="#e41626" />
        </g>
      </svg>
    </div>
  );
}
