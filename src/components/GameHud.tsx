import { useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, ChevronUp, LogOut, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { formatDistance, formatSpeed, speedUnit, type Note } from '@/core';
import { useApp, useRideStore } from '@/lib/store';
import { stopRide } from '@/ride/controller';
import { attachKeys, pressEdge, setTouch } from '@/ride/gameInput';
import { useGame } from '@/ride/gameState';
import { cn, SEV_COLOR } from '@/lib/cn';
import { TurnText } from './Chip';
import { TurnArrow } from './TurnArrow';
import { Button } from './ui';

/** Hold-to-press button for the touch controls. */
function Hold({ label, onChange, className, children }: { label: string; onChange: (down: boolean) => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={cn('grid touch-none select-none place-items-center rounded-3xl bg-panel/90 text-ink shadow-xl active:bg-brand', className)}
    >
      {children}
    </button>
  );
}

const TOAST: Record<string, string> = { clean: 'bg-go text-dark', sloppy: 'bg-sev3 text-dark', crash: 'bg-sev1 text-white', bump: 'bg-sev3 text-dark', info: 'bg-panel text-ink' };

/**
 * The whole screen while the game is on. Only what the game needs: the next call, speed, score, the touch
 * controls, and the ways out (pause, turn around, mute, exit). Settings, saved routes and the rest are hidden.
 */
export function GameHud() {
  const stage = useApp((s) => s.stage);
  const settings = useApp((s) => s.settings);
  const set = useApp((s) => s.set);
  const { s, v, gpsError, lastCall } = useRideStore();
  const g = useGame();

  useEffect(() => attachKeys(), []);

  // the last result stays up for a moment
  const feedback = g.feedback && Date.now() - g.feedback.at < 1800 ? g.feedback : null;
  useEffect(() => {
    if (!g.feedback) return;
    const t = setTimeout(() => useGame.setState({ feedback: null }), 1800);
    return () => clearTimeout(t);
  }, [g.feedback]);

  const upcoming = useMemo(() => (stage ? stage.notes.filter((n) => n.s > s - 8).slice(0, 3) : ([] as Note[])), [stage, s]);
  const [next] = upcoming;
  const opts = { dialect: settings.dialect, units: settings.units };
  const kmh = v * 3.6;
  const alert = lastCall?.urgency === 'slow';

  return (
    <div className="theme-dark contents">
      <div className="safe-t pointer-events-none absolute inset-x-0 top-0 z-10 px-3">
        <div className={cn('pointer-events-auto rounded-3xl bg-panel/95 p-3 shadow-2xl backdrop-blur', alert && 'ring-4 ring-sev1')}>
          <div className="flex items-center gap-3">
            {next ? (
              <>
                <TurnArrow note={next} size={76} />
                <div className="min-w-0 flex-1">
                  <TurnText note={next} opts={opts} readout={settings.readout === 'short' ? 'both' : settings.readout} big />
                  <div style={{ color: next.severity ? SEV_COLOR[next.severity] : undefined }} className="mt-1 font-display text-3xl font-semibold leading-none tabular-nums">
                    {formatDistance(Math.max(0, next.s - s), settings.units)}
                  </div>
                </div>
              </>
            ) : (
              <div className="min-w-0 flex-1 font-display text-3xl font-bold">{gpsError ? 'Getting ready' : 'Clear road'}</div>
            )}
            <div className="text-right">
              <div className="font-display text-5xl font-bold leading-none tabular-nums">{formatSpeed(kmh, settings.units)}</div>
              <div className="text-xs text-mute">{speedUnit(settings.units)}</div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="rounded-lg bg-raise px-2 py-1 font-display font-bold tabular-nums">{g.score.toLocaleString()} pts</span>
            <span className="rounded-lg bg-raise px-2 py-1 tabular-nums">streak {g.streak}</span>
            <span className="ml-auto text-mute tabular-nums">best {Math.max(g.best, g.score).toLocaleString()}</span>
          </div>
          {gpsError && <p className="mt-2 text-sm text-sev3">{gpsError}</p>}
          {g.junction && !gpsError && (
            <p className="mt-2 text-sm font-medium text-brand">Junction in {formatDistance(g.junction.dist, settings.units)}: steer left or right to choose the road, or hold straight.</p>
          )}
          {g.deadEnd && <p className="mt-2 text-sm font-medium text-sev2">Dead end. Turn around to carry on.</p>}
        </div>
        {feedback && <div className={cn('pointer-events-none mx-auto mt-2 w-fit rounded-2xl px-4 py-2 font-display text-xl font-bold shadow-xl', TOAST[feedback.kind])}>{feedback.text}</div>}
      </div>

      {g.paused && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/60">
          <div className="rounded-3xl bg-panel p-6 text-center">
            <div className="font-display text-4xl font-bold">Paused</div>
            <p className="mt-1 text-sm text-mute">{g.pad ? 'Press Start to carry on.' : 'Press P, or the button below.'}</p>
            <Button variant="primary" className="mt-4 w-full" onClick={() => pressEdge('pause')}>
              <Play size={18} fill="currentColor" /> Carry on
            </Button>
          </div>
        </div>
      )}

      <div className="safe-b pointer-events-none absolute inset-x-0 bottom-0 z-10 space-y-2 px-3 pb-2">
        {!g.pad && (
          <div className="pointer-events-auto flex items-end justify-between gap-3">
            <div className="flex gap-2">
              <Hold label="Steer left" onChange={(d) => setTouch({ steer: d ? -1 : 0 })} className="size-20">
                <ArrowLeft size={36} />
              </Hold>
              <Hold label="Steer right" onChange={(d) => setTouch({ steer: d ? 1 : 0 })} className="size-20">
                <ArrowRight size={36} />
              </Hold>
            </div>
            <div className="flex gap-2">
              <Hold label="Brake" onChange={(d) => setTouch({ brake: d ? 1 : 0 })} className="h-20 w-24 bg-sev1/80 font-display text-lg font-bold">
                Brake
              </Hold>
              <Hold label="Gas" onChange={(d) => setTouch({ throttle: d ? 1 : 0 })} className="h-28 w-24 bg-go/90 font-display text-lg font-bold text-dark">
                <ChevronUp size={30} />
                Gas
              </Hold>
            </div>
          </div>
        )}
        {g.pad && <p className="pointer-events-auto rounded-xl bg-panel/90 p-2 text-center text-xs text-mute">Controller: stick steers, right trigger gas, left trigger brake, Start pauses, Y turns around.</p>}
        <div className="pointer-events-auto flex gap-2">
          <Button variant="raise" className="flex-1 bg-sev1 text-white hover:bg-sev1/90" onClick={stopRide} aria-label="Exit game">
            <LogOut size={18} /> Exit game
          </Button>
          <Button variant="raise" aria-label="Pause" onClick={() => pressEdge('pause')}>
            <Pause size={20} />
          </Button>
          <Button variant="raise" aria-label="Turn the car around" onClick={() => pressEdge('turn')}>
            <RotateCcw size={20} />
          </Button>
          <Button variant="raise" aria-label={settings.muted ? 'Unmute voice' : 'Mute voice'} onClick={() => set({ muted: !settings.muted })}>
            {settings.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
