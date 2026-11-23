import { useMemo } from 'react';
import { LayoutList, Settings as Cog, Square, Volume2, VolumeX } from 'lucide-react';
import { formatDistance, formatSpeed, formatTrip, headingLabel, speedUnit, tripUnit, type Note } from '@/core';
import { cn, SEV_COLOR } from '@/lib/cn';
import { useApp, useRideStore } from '@/lib/store';
import { stopRide } from '@/ride/controller';
import { CallLabel, TurnText } from './Chip';
import { Corrections } from './Corrections';
import { Glyph } from './Glyph';
import { TurnArrow } from './TurnArrow';
import { Button } from './ui';

/** Stage view: the next call huge, the three after it listed with distances, speed and distance left. High contrast, no map. */
export function StageHud() {
  const stage = useApp((s) => s.stage);
  const settings = useApp((s) => s.settings);
  const set = useApp((s) => s.set);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const { s, v, bearing, lastCall, offRoute, gpsError, kind } = useRideStore();

  const upcoming = useMemo(() => (stage ? stage.notes.filter((n) => n.s > s - 8).slice(0, 4) : ([] as Note[])), [stage, s]);
  if (!stage) return null;

  const opts = { dialect: settings.dialect, units: settings.units };
  const [next, ...later] = upcoming;
  const words = settings.readout !== 'short';
  const toNext = next ? Math.max(0, next.s - s) : 0;
  const left = Math.max(0, stage.stats.distanceM - s);
  const color = next?.severity ? SEV_COLOR[next.severity] : '#fff';
  const alert = lastCall?.urgency === 'slow';
  // trip meter: distance since the last call, the way a co-driver resets it at each roadbook point
  const passed = stage.notes.filter((n) => n.s <= s).pop();
  const trip = s - (passed?.s ?? 0);
  const head = headingLabel(bearing);

  return (
    <div className={cn('safe-t absolute inset-0 z-20 flex flex-col gap-2 overflow-y-auto bg-black px-3 pb-3', alert && 'ring-8 ring-inset ring-sev1')} data-testid="stage-hud">
      <div className="shrink-0 pt-1" data-testid="rally-computer">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-display text-5xl font-bold leading-none tabular-nums">{formatSpeed(v * 3.6, settings.units)}</div>
            <div className="text-xs text-mute">{speedUnit(settings.units)}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-4xl font-bold leading-none tabular-nums">{head.deg}°</div>
            <div className="text-xs text-mute">heading {head.wind}</div>
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-panel px-2 py-1">
            <div className="font-display text-xl font-semibold leading-none tabular-nums">{formatTrip(trip, settings.units)}</div>
            <div className="mt-0.5 text-[11px] text-mute">trip {tripUnit(settings.units)}</div>
          </div>
          <div className="rounded-2xl bg-panel px-2 py-1">
            <div className="font-display text-xl font-semibold leading-none tabular-nums">{formatTrip(s, settings.units)}</div>
            <div className="mt-0.5 text-[11px] text-mute">total {tripUnit(settings.units)}</div>
          </div>
          <div className="rounded-2xl bg-panel px-2 py-1">
            <div className="font-display text-xl font-semibold leading-none tabular-nums">{formatTrip(left, settings.units)}</div>
            <div className="mt-0.5 text-[11px] text-mute">left {tripUnit(settings.units)}</div>
          </div>
        </div>
      </div>

      {next ? (
        <div className="shrink-0 rounded-3xl bg-panel p-2.5">
          <div className="flex items-center gap-4">
            {words ? <TurnArrow note={next} size={80} /> : <Glyph note={next} size={76} />}
            <div className="min-w-0 flex-1">
              <TurnText note={next} opts={opts} readout={settings.readout} big />
              <div style={{ color }} className="mt-1 font-display text-4xl font-bold leading-none tabular-nums">{formatDistance(toNext, settings.units)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-panel p-6 font-display text-6xl font-bold">Finish</div>
      )}

      <ol className="shrink-0 space-y-1.5" aria-label="Next calls">
        {later.slice(0, 3).map((n) => (
          <li key={n.id} className="flex items-center gap-3 rounded-2xl bg-panel/70 px-3 py-1">
            {words ? <TurnArrow note={n} size={44} word={false} /> : <Glyph note={n} size={40} />}
            <div className="min-w-0 flex-1">{words ? <TurnText note={n} opts={opts} readout="full" /> : <CallLabel note={n} opts={opts} />}</div>
            <div className="font-display text-xl font-semibold tabular-nums text-mute">{formatDistance(Math.max(0, n.s - s), settings.units)}</div>
          </li>
        ))}
      </ol>

      {offRoute && <p className="text-sm font-medium text-sev2">Off the planned route. Notes resume when you rejoin it.</p>}
      {gpsError && <p className="text-sm text-sev3">{gpsError}</p>}

      <div className="mt-auto shrink-0 space-y-2 pt-1">
        <Corrections />
        <div className="flex gap-2">
          <Button variant="raise" className="flex-1 bg-sev1 text-white hover:bg-sev1/90" onClick={stopRide} aria-label="Stop ride">
            <Square size={18} fill="currentColor" /> Stop{kind === 'demo' ? ' demo' : ''}
          </Button>
          <Button variant="raise" aria-label={settings.muted ? 'Unmute voice' : 'Mute voice'} onClick={() => set({ muted: !settings.muted })}>
            {settings.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </Button>
          <Button variant="raise" aria-label="Show the map view" onClick={() => set({ stageView: false })}>
            <LayoutList size={20} />
          </Button>
          <Button variant="raise" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Cog size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
}
