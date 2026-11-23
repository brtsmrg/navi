import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { applyEdit, formatDistance, noteText, type Note, type Stage } from '@/core';
import { useApp } from '@/lib/store';
import { useEdits } from '@/lib/edits';
import { resetAllEdits } from '@/lib/noteEdits';
import { cn } from '@/lib/cn';
import { CallLabel, TurnText } from './Chip';
import { Glyph } from './Glyph';
import { NoteEditor } from './NoteEditor';
import { TurnArrow } from './TurnArrow';

/** Every call on the route. Tap one to change how it is called. */
export function NotesList({ stage }: { stage: Stage }) {
  const { dialect, units, readout } = useApp((s) => s.settings);
  const edits = useEdits((s) => (stage.key ? s.byRoute[stage.key] : undefined));
  const [editing, setEditing] = useState<Note | null>(null);
  const opts = { dialect, units };
  const base = (stage.baseNotes ?? stage.notes).filter((n) => n.kind !== 'finish');
  if (base.length === 0) {
    return <p className="py-6 text-center text-mute">No corners found on this route. It is a straight run.</p>;
  }
  const editCount = edits ? Object.keys(edits).length : 0;
  return (
    <div>
      <p className="pb-2 text-sm text-mute">Tap a call to change it, add your own words, or skip it. Changes are saved on this phone for this route.</p>
      <ol className="divide-y divide-line">
        {base.map((b) => {
          const n = applyEdit(b, edits?.[b.id]);
          const skipped = !!edits?.[b.id]?.hidden;
          const touched = !!edits?.[b.id];
          return (
            <li key={b.id}>
              <button onClick={() => setEditing(b)} aria-label={`Edit call: ${noteText(n, opts)}`} className={cn('flex min-h-16 w-full items-center gap-3 py-3 text-left', skipped && 'opacity-50')}>
                {readout === 'short' ? <Glyph note={n} size={48} /> : <TurnArrow note={n} size={48} word={false} />}
                <div className="min-w-0 flex-1">
                  {readout === 'short' ? <CallLabel note={n} opts={opts} /> : <TurnText note={n} opts={opts} readout={readout} />}
                  <div className={cn('truncate text-sm text-mute', skipped && 'line-through')}>Says: “{noteText(n, opts)}”</div>
                </div>
                {touched && <Pencil size={14} className="shrink-0 text-brand" aria-label="Edited" />}
                <div className="font-display text-xl text-mute">{formatDistance(n.s, units)}</div>
              </button>
            </li>
          );
        })}
      </ol>
      {editCount > 0 && (
        <button onClick={resetAllEdits} className="mt-2 min-h-11 text-sm text-mute underline">
          Put all {editCount} edited call{editCount === 1 ? '' : 's'} back to the original
        </button>
      )}
      <NoteEditor note={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
