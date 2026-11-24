import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import type { Stage } from '@/core';
import { estimateCents, missingSegments, PremiumError, prepareVoice, routeSegments, type PrepareState } from '@/lib/premium';
import { unlockAudio } from '@/lib/audio';
import { useApp } from '@/lib/store';
import { Button } from './ui';

/** Makes the premium voice's calls for this route ahead of the ride, so the ride itself needs no signal. */
export function PrepareVoice({ stage }: { stage: Stage }) {
  const engine = useApp((s) => s.settings.voiceEngine);
  const key = useApp((s) => s.settings.premiumKey);
  const voice = useApp((s) => s.settings.premiumVoice);
  const dialect = useApp((s) => s.settings.dialect);
  const units = useApp((s) => s.settings.units);
  const leadSec = useApp((s) => s.settings.leadSec);
  const speechRate = useApp((s) => s.settings.speechRate);
  const [progress, setProgress] = useState<PrepareState | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const on = engine === 'premium' && key.trim().length > 20;

  const segs = useMemo(() => (on ? routeSegments(stage, useApp.getState().settings) : []), [on, stage, dialect, units, leadSec, speechRate]);
  const todo = useMemo(() => (on ? missingSegments(segs) : []), [on, segs, voice, tick]);
  useEffect(() => () => abort.current?.abort(), []);
  if (!on) return null;

  const run = async () => {
    unlockAudio();
    setError('');
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    try {
      await prepareVoice(segs, setProgress, ac.signal);
    } catch (e) {
      if (!(e instanceof DOMException)) setError(e instanceof PremiumError ? e.message : 'Something went wrong while making the voice. Try again.');
    }
    setProgress(null);
    setTick((t) => t + 1);
  };

  const busy = progress !== null;
  return (
    <div className="space-y-2 rounded-2xl bg-bg p-3">
      <div className="flex items-center gap-2 text-sm font-medium"><Mic size={16} /> Premium voice for this road</div>
      {busy ? (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-raise" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full bg-go transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="text-sm text-mute">Making the voice: {progress.done} of {progress.total}. Keep this screen open.</p>
        </>
      ) : todo.length === 0 ? (
        <p className="text-sm text-mute">Ready. Every call on this road is on your phone, so it works with no signal.</p>
      ) : (
        <>
          <p className="text-sm text-mute">{todo.length} parts to make, about {estimateCents(todo)} US cents on your OpenAI key. You only do this once per road. Without it, calls are made as you drive, if there is signal.</p>
          <Button variant="raise" className="w-full" onClick={run}>Prepare voice</Button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-sev3">{error}</p>}
    </div>
  );
}
