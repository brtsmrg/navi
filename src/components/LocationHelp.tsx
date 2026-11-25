import { useEffect, useState } from 'react';
import { MapPinOff } from 'lucide-react';
import { currentPlatform, gpsOnce, helpSteps } from '@/lib/location';
import { useApp } from '@/lib/store';
import { Button } from './ui';

/** Shows only after the phone refused location: what to tap to turn it back on, and a way to try again. */
export function LocationHelp({ compact = false }: { compact?: boolean }) {
  const blocked = useApp((s) => s.locationBlocked);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState('');

  useEffect(() => {
    if (blocked) document.getElementById('loc-help')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [blocked]);

  if (!blocked) return null;
  const steps = helpSteps(currentPlatform());
  const retry = async () => {
    setBusy(true);
    setAgain('');
    try {
      useApp.getState().setUserPos(await gpsOnce());
    } catch {
      setAgain('Still blocked. Finish the steps above, then try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="loc-help" role="alert" className="rounded-2xl bg-sev1/15 p-4 text-[15px]">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
        <MapPinOff size={20} /> Location is off for Navi
      </h2>
      {!compact && <p className="mt-1 text-mute">Your phone is blocking location, so Navi cannot see where you are. Navi has no account and no tracking. When you search, plan a route or save roads, the place or area you ask about is sent to the open map services that do that job.</p>}
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink">
        {steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void retry()}>
          {busy ? 'Checking…' : 'Try again'}
        </Button>
        {again && <span className="text-sm text-sev2">{again}</span>}
      </div>
      {!compact && <p className="mt-2 text-sm text-mute">Or skip it: search for a place under Start point and Fun loop, Near me, Game mode and saved roads will start from there. Free roam always needs live location.</p>}
    </section>
  );
}
