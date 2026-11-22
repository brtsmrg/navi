import { useRef, useState } from 'react';
import { Flag, Play, Share2, Upload, Wand2 } from 'lucide-react';
import { demoStage, generateStage, type Stage } from '@/core';
import { parseGpx } from '@/providers/gpx';
import { buildShareUrl } from '@/providers/share';
import { planWaypoints } from '@/lib/plan';
import { useApp } from '@/lib/store';
import { startRide } from '@/ride/controller';
import { cn, SEV_COLOR } from '@/lib/cn';
import { NotesList } from './NotesList';
import { PlaceField } from './PlaceField';
import { SafetyGate } from './SafetyGate';
import { Button } from './ui';

function Stats({ stage }: { stage: Stage }) {
  const { units } = useApp((s) => s.settings);
  const st = stage.stats;
  const dist = units === 'imperial' ? `${(st.distanceM / 1609.344).toFixed(1)} mi` : `${(st.distanceM / 1000).toFixed(1)} km`;
  const total = st.bySeverity.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="rounded-2xl bg-bg p-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          [dist, 'distance'],
          [String(st.cornerCount), 'corners'],
          [String(st.hairpins), 'hairpins'],
          [String(Math.round(st.twistScore)), 'twist'],
        ].map(([v, l]) => (
          <div key={l}>
            <div className="font-display text-3xl font-semibold leading-none">{v}</div>
            <div className="mt-1 text-xs text-mute">{l}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line" role="img" aria-label="Corner mix from tight to flat">
        {st.bySeverity.map((n, i) => (
          <div key={i} style={{ width: `${(n / total) * 100}%`, background: SEV_COLOR[i + 1] }} />
        ))}
      </div>
    </div>
  );
}

export function PlanPanel() {
  const { stage, from, to, setFrom, setTo, setStage, settings, set } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [gate, setGate] = useState<null | (() => void)>(null);
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const plan = async () => {
    if (!from || !to) return;
    setBusy(true);
    setErr('');
    try {
      setStage(await planWaypoints([from.lngLat, to.lngLat]));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not plan that route.');
    } finally {
      setBusy(false);
    }
  };

  const onGpx = async (f: File | undefined) => {
    if (!f) return;
    setErr('');
    try {
      setStage(generateStage(parseGpx(await f.text())));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That file could not be read as a route.');
    }
  };

  const guarded = (go: () => void) => (settings.safetyAccepted ? go() : setGate(() => go));

  const share = async () => {
    if (!from || !to) return;
    const url = buildShareUrl(location.origin + location.pathname.replace(/\/$/, ''), { waypoints: [from.lngLat, to.lngLat], dialect: settings.dialect });
    try {
      if (navigator.share) await navigator.share({ title: 'Navi route', url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className={cn('safe-b absolute inset-x-0 bottom-0 z-10 max-h-[58dvh] overflow-y-auto rounded-t-3xl bg-panel p-4 shadow-2xl md:inset-y-3 md:left-3 md:right-auto md:max-h-none md:w-[400px] md:rounded-3xl')}>
      <h1 className="font-display text-3xl font-semibold">Navi</h1>
      <p className="mb-3 text-sm text-mute">Your co-driver for any road. It calls each corner before you reach it.</p>

      <div className="space-y-2">
        <PlaceField label="From" value={from} onChange={setFrom} allowLocate />
        <PlaceField label="To" value={to} onChange={setTo} />
        <Button variant="primary" className="w-full" disabled={!from || !to || busy} onClick={plan}>
          <Flag size={18} /> {busy ? 'Reading the road…' : 'Write the pacenotes'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="raise" onClick={() => setStage(generateStage(demoStage()))}>
            <Wand2 size={18} /> Try a demo stage
          </Button>
          <Button variant="raise" onClick={() => file.current?.click()}>
            <Upload size={18} /> Load a GPX
          </Button>
          <input ref={file} type="file" accept=".gpx,application/gpx+xml,text/xml" className="hidden" onChange={(e) => { void onGpx(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      {err && <p role="alert" className="mt-3 rounded-xl bg-sev1/15 p-3 text-sm text-sev2">{err}</p>}

      {stage && (
        <div className="mt-4 space-y-3">
          <Stats stage={stage} />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button variant="primary" className="bg-go text-bg hover:bg-go/90" onClick={() => guarded(() => startRide(stage, { kind: 'gps' }))}>
              <Play size={18} fill="currentColor" /> Start with GPS
            </Button>
            <Button variant="raise" disabled={!from || !to} onClick={share} aria-label="Share route link">
              <Share2 size={18} /> {copied ? 'Copied' : ''}
            </Button>
          </div>
          <Button variant="raise" className="w-full" onClick={() => guarded(() => startRide(stage, { kind: 'demo', cruiseKmh: 90, warp: 2 }))}>
            Watch a demo drive (no GPS)
          </Button>
          <NotesList notes={stage.notes} />
        </div>
      )}

      <SafetyGate
        open={gate !== null}
        onAccept={() => {
          set({ safetyAccepted: true });
          const go = gate;
          setGate(null);
          go?.();
        }}
      />
    </div>
  );
}
