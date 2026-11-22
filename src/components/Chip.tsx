import type { Note, PhraseOptions } from '@/core';
import { fullLabel, noteLabel } from '@/core';
import type { Readout } from '@/lib/store';
import { cn, SEV_COLOR } from '@/lib/cn';

/** "L4" / "R3" style call label with direction colour. */
export function CallLabel({ note, opts, big = false }: { note: Note; opts: PhraseOptions; big?: boolean }) {
  const l = noteLabel(note, opts);
  const dirColor = l.dir === 'L' ? 'text-dirl' : l.dir === 'R' ? 'text-dirr' : 'text-ink';
  const sevColor = note.severity ? SEV_COLOR[note.severity] : undefined;
  return (
    <div className={cn('flex items-baseline gap-1.5 font-display font-bold leading-none', big ? 'text-7xl' : 'text-3xl')}>
      {l.dir && <span className={cn(dirColor)}>{l.dir === 'L' ? '‹' : '›'}</span>}
      {l.dir && <span className={dirColor}>{l.dir}</span>}
      <span style={{ color: sevColor }} className={sevColor ? '' : 'text-ink'}>
        {l.num}
      </span>
      {l.mods.length > 0 && (
        <span className={cn('font-medium text-mute', big ? 'text-2xl' : 'text-base')}>{l.mods.join(' ')}</span>
      )}
    </div>
  );
}

/** The turn as text, in the driver's chosen readout: words, shorthand, or both. */
export function TurnText({ note, opts, readout, big = false }: { note: Note; opts: PhraseOptions; readout: Readout; big?: boolean }) {
  const f = fullLabel(note);
  if (readout === 'short') return <CallLabel note={note} opts={opts} big={big} />;
  const l = noteLabel(note, opts);
  return (
    <div className="min-w-0">
      <div className={cn('font-display font-bold leading-none', big ? 'text-5xl' : 'text-2xl')}>{f.headline}</div>
      {(f.detail || readout === 'both') && (
        <div className={cn('mt-1 flex flex-wrap items-center gap-x-2 text-mute', big ? 'text-lg' : 'text-sm')}>
          {f.detail && <span className="capitalize">{f.detail}</span>}
          {readout === 'both' && l.dir && (
            <span className="rounded-md bg-raise px-1.5 font-display font-bold text-ink">
              {l.dir}
              {l.num}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
