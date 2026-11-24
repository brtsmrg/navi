import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import type { Stage } from '@/core';
import { estimateCents, loadStored, missingSegments, PremiumError, prepareVoice, routeSegments, type PrepareState } from '@/lib/premium';
import { MODEL_MB } from '@/lib/kokoro/urls';
import { unlockAudio } from '@/lib/audio';
import { useApp } from '@/lib/store';
import { Button } from './ui';

const minutes = (sec: number) => (sec < 90 ? `${Math.max(5, Math.round(sec / 5) * 5)} seconds` : `${Math.round(sec / 60)} minutes`);

/** Makes the premium or on-phone voice's calls for this route ahead of the ride, so the ride itself needs no signal. */
export function PrepareVoice({ stage }: { stage: Stage }) {
  const engine = useApp((s) => s.settings.voiceEngine);
  const key = useApp((s) => s.settings.premiumKey);
  const voice = useApp((s) => (s.settings.voiceEngine === 'ondevice' ? s.settings.deviceVoice : s.settings.premiumVoice));
  const dialect = useApp((s) => s.settings.dialect);
  const units = useApp((s) => s.settings.units);
  const leadSec = useApp((s) => s.settings.leadSec);
  const speechRate = useApp((s) => s.settings.speechRate);
  const [progress, setProgress] = useState<PrepareState | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const homeOk = useApp((s) => s.settings.homeUrl.length > 8 && s.settings.homeToken.length > 15);
  const device = engine === 'ondevice';
  const home = engine === 'home';
  const on = device || (home && homeOk) || (engine === 'premium' && key.trim().length > 20);

  const segs = useMemo(() => (on ? routeSegments(stage, useApp.getState().settings) : []), [on, stage, dialect, units, leadSec, speechRate]);
  // takes kept from an earlier visit count as made: load them, then look again
  useEffect(() => {
    if (!on) return;
    let live = true;
    void loadStored(segs).then(() => live && setTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, [on, segs, voice]);
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
  const downloading = !!progress?.download && progress.done === 0 && progress.etaSec === undefined;
  const mb = (n: number) => Math.round(n / 1e5) / 10;
  return (
    <div className="space-y-2 rounded-2xl bg-bg p-3">
      <div className="flex items-center gap-2 text-sm font-medium"><Mic size={16} /> {device ? 'Free voice for this road' : home ? 'Home PC voice for this road' : 'Premium voice for this road'}</div>
      {busy ? (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-raise" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full bg-go transition-all" style={{ width: `${downloading ? (progress.download && progress.download.total ? (progress.download.loaded / progress.download.total) * 100 : 3) : progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="text-sm text-mute">
            {downloading
              ? `Downloading the voice, once: ${mb(progress.download?.loaded ?? 0)} of ${progress.download?.total ? mb(progress.download.total) : MODEL_MB} MB. Keep this screen open.`
              : `Making the voice: ${progress.done} of ${progress.total}.${progress.etaSec !== undefined && progress.done > 2 ? ` About ${minutes(progress.etaSec)} left.` : ''} Keep this screen open.`}
          </p>
          <Button variant="raise" className="w-full" onClick={() => abort.current?.abort()}>Stop (what is made is kept)</Button>
        </>
      ) : todo.length === 0 ? (
        <p className="text-sm text-mute">Ready. Every call on this road is on your phone, so it works with no signal.</p>
      ) : device ? (
        <>
          <p className="text-sm text-mute">{todo.length} parts to make on your phone, free. The first time it also downloads the voice ({MODEL_MB} MB, use Wi-Fi). Plug in, keep the screen on, and expect a few minutes. You only do this once per road. A call that is not ready is spoken by the recorded voice.</p>
          <Button variant="raise" className="w-full" onClick={run}>Prepare voice</Button>
        </>
      ) : home ? (
        <>
          <p className="text-sm text-mute">{todo.length} parts to make on your PC's graphics card, free. Keep the voice window open on your PC. You only do this once per road. A call that is not ready is spoken by the recorded voice.</p>
          <Button variant="raise" className="w-full" onClick={run}>Prepare voice</Button>
        </>
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
