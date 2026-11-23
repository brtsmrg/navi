import { useEffect, useState } from 'react';
import { ChevronsDown, ChevronsUp, Clock, RotateCcw, Timer } from 'lucide-react';
import { useApp, useRideStore } from '@/lib/store';
import { correctNearest } from '@/lib/noteEdits';
import { repeatLast } from '@/ride/controller';
import { cn } from '@/lib/cn';

const MIN_LEAD = 4;
const MAX_LEAD = 12;

/** Driver corrections while driving: hear it again, say the last corner was tighter or easier, call sooner or later. */
export function Corrections({ className }: { className?: string }) {
  const leadSec = useApp((s) => s.settings.leadSec);
  const set = useApp((s) => s.set);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(''), 7000);
    return () => window.clearTimeout(t);
  }, [msg]);

  const fix = (tighter: boolean) => setMsg(correctNearest(useRideStore.getState().s, tighter));
  const lead = (d: number) => {
    const next = Math.min(MAX_LEAD, Math.max(MIN_LEAD, leadSec + d));
    if (next === leadSec) return setMsg(d > 0 ? 'Calls are already as early as they go.' : 'Calls are already as late as they go.');
    set({ leadSec: next });
    setMsg(`Calls now come about ${next} seconds before the corner.`);
  };

  const btn = 'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-raise px-1 text-xs font-medium text-ink ring-1 ring-line transition active:scale-[0.97]';
  return (
    <div className={cn('pointer-events-auto', className)}>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Corrections">
        <button className={btn} onClick={() => repeatLast()} aria-label="Hear the last call again">
          <RotateCcw size={18} /> Repeat
        </button>
        <button className={btn} onClick={() => fix(true)} aria-label="The last corner was tighter than called">
          <ChevronsDown size={18} /> Tighter
        </button>
        <button className={btn} onClick={() => fix(false)} aria-label="The last corner was easier than called">
          <ChevronsUp size={18} /> Easier
        </button>
        <button className={btn} onClick={() => lead(1)} aria-label="Call corners sooner">
          <Timer size={18} /> Sooner
        </button>
        <button className={btn} onClick={() => lead(-1)} aria-label="Call corners later">
          <Clock size={18} /> Later
        </button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-mute">
        {msg || 'Tap Tighter or Easier right after a corner that was called wrong.'}
      </p>
    </div>
  );
}
