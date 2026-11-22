import { formatDistance, noteText, type Note } from '@/core';
import { useApp } from '@/lib/store';
import { CallLabel, TurnText } from './Chip';
import { Glyph } from './Glyph';
import { TurnArrow } from './TurnArrow';

export function NotesList({ notes }: { notes: Note[] }) {
  const { dialect, units, readout } = useApp((s) => s.settings);
  const opts = { dialect, units };
  const shown = notes.filter((n) => n.kind !== 'finish');
  if (shown.length === 0) {
    return <p className="py-6 text-center text-mute">No corners found on this route. It is a straight run.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      {shown.map((n) => (
        <li key={n.id} className="flex items-center gap-3 py-3">
          {readout === 'short' ? <Glyph note={n} size={48} /> : <TurnArrow note={n} size={48} word={false} />}
          <div className="min-w-0 flex-1">
            {readout === 'short' ? <CallLabel note={n} opts={opts} /> : <TurnText note={n} opts={opts} readout={readout} />}
            <div className="truncate text-sm text-mute">Says: “{noteText(n, opts)}”</div>
          </div>
          <div className="font-display text-xl text-mute">{formatDistance(n.s, units)}</div>
        </li>
      ))}
    </ol>
  );
}
