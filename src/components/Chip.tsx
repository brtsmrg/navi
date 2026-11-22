import type { Note, PhraseOptions } from '@/core';
import { noteLabel } from '@/core';
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
