import { useMemo } from 'react';
import { Square, Volume2, VolumeX, Settings as Cog, TriangleAlert } from 'lucide-react';
import { formatDistance, formatSpeed, speedUnit, type Note } from '@/core';
import { useApp, useRideStore } from '@/lib/store';
import { stopRide } from '@/ride/controller';
import { cn } from '@/lib/cn';
import { CallLabel, TurnText } from './Chip';
import { Glyph } from './Glyph';
import { TurnArrow } from './TurnArrow';
import { Button } from './ui';

export function Hud() {
  const stage = useApp((s) => s.stage);
  const settings = useApp((s) => s.settings);
  const set = useApp((s) => s.set);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const { s, v, lastCall, offRoute, gpsError, kind, audioNote } = useRideStore();

  const upcoming = useMemo(() => {
    if (!stage) return [] as Note[];
    return stage.notes.filter((n) => n.s > s - 8).slice(0, 4);
  }, [stage, s]);

  if (!stage) return null;
  const opts = { dialect: settings.dialect, units: settings.units };
  const [next, ...later] = upcoming;
  const alert = lastCall?.urgency === 'slow';
  const kmh = v * 3.6;
  const left = Math.max(0, stage.stats.distanceM - s);
  const toNext = next ? Math.max(0, next.s - s) : 0;
  // glow the side of the turn once it is inside the warning window
  const cueSide = next?.side && toNext <= Math.max(120, v * (settings.leadSec + 3)) ? next.side : undefined;
  const words = settings.readout !== 'short';

  return (
    <>
      {cueSide && <div aria-hidden className={cn('edge-cue', cueSide === 'L' ? 'l' : 'r')} />}
      <div className="safe-t pointer-events-none absolute inset-x-0 top-0 z-10 px-3">
        <div className={cn('pointer-events-auto rounded-3xl bg-panel/95 p-4 shadow-2xl backdrop-blur', alert && 'ring-4 ring-sev1')}>
          {next ? (
            <div className="flex items-center gap-3">
              {words ? <TurnArrow note={next} size={92} /> : <Glyph note={next} size={84} />}
              <div className="min-w-0 flex-1">
                <TurnText note={next} opts={opts} readout={settings.readout} big />
                <div className="mt-2 font-display text-4xl font-semibold leading-none">{formatDistance(toNext, settings.units)}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-5xl font-bold leading-none">{formatSpeed(kmh, settings.units)}</div>
                <div className="text-xs text-mute">{speedUnit(settings.units)}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="font-display text-5xl font-bold">Arrive</div>
              <div className="text-mute">{formatDistance(left, settings.units)} left</div>
            </div>
          )}

          {later.length > 0 && (
            <div className="mt-3 flex items-center gap-4 overflow-hidden border-t border-line pt-3">
              {later.slice(0, 2).map((n) => (
                <div key={n.id} className="flex min-w-0 items-center gap-2">
                  {words ? <TurnArrow note={n} size={40} word={false} /> : <Glyph note={n} size={34} />}
                  <div className="min-w-0">
                    {words ? <TurnText note={n} opts={opts} readout="full" /> : <CallLabel note={n} opts={opts} />}
                    <div className="text-xs text-mute">{formatDistance(Math.max(0, n.s - s), settings.units)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {lastCall && (
            <p aria-live="polite" className="call-in mt-3 text-lg leading-snug text-ink" key={lastCall.at}>
              “{lastCall.text}”
            </p>
          )}
          {audioNote && (
            <p className="mt-2 flex items-start gap-2 text-sm text-sev3">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" /> {audioNote}
            </p>
          )}
          {offRoute && <p className="mt-2 text-sm font-medium text-sev2">Off the planned route. Notes resume when you rejoin it.</p>}
          {gpsError && <p className="mt-2 text-sm text-sev3">{gpsError}</p>}
        </div>

        <div className="pointer-events-auto mt-2 flex gap-2">
          <Button variant="raise" className="flex-1 bg-sev1 text-white hover:bg-sev1/90" onClick={stopRide} aria-label="Stop ride">
            <Square size={18} fill="currentColor" /> Stop{kind === 'demo' ? ' demo' : ''}
          </Button>
          <Button variant="raise" aria-label={settings.muted ? 'Unmute voice' : 'Mute voice'} onClick={() => set({ muted: !settings.muted })}>
            {settings.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </Button>
          <Button variant="raise" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Cog size={20} />
          </Button>
        </div>
      </div>
    </>
  );
}
