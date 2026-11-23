import { useEffect, useState } from 'react';
import { MAX_EXTRA, applyEdit, isEmptyEdit, noteText, type Note, type NoteEdit, type Severity } from '@/core';
import { cn, SEV_COLOR } from '@/lib/cn';
import { useEdits } from '@/lib/edits';
import { editNote, resetNote } from '@/lib/noteEdits';
import { useApp } from '@/lib/store';
import { TurnArrow } from './TurnArrow';
import { Button, Segmented, Sheet, Toggle } from './ui';

const LEVELS: [Severity, string][] = [[1, 'Hairpin'], [2, 'Sharp'], [3, 'Medium'], [4, 'Easy'], [5, 'Gentle'], [6, 'Almost flat']];
const MODS: ['long' | 'tightens' | 'opens' | 'caution', string][] = [
  ['long', 'Long corner'],
  ['tightens', 'Tightens at the end'],
  ['opens', 'Opens at the end'],
  ['caution', 'Say “careful”'],
];

/** Change how one pacenote is called. Saved on this phone for this route; the engine's original stays underneath. */
export function NoteEditor({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const stageKey = useApp((s) => s.stage?.key);
  const { dialect, units } = useApp((s) => s.settings);
  const edit: NoteEdit | undefined = useEdits((s) => (stageKey && note ? s.byRoute[stageKey]?.[note.id] : undefined));
  const [extra, setExtra] = useState('');
  useEffect(() => setExtra(edit?.extra ?? ''), [note?.id, edit?.extra]);
  if (!note) return null;

  const shown = applyEdit(note, edit);
  const isCorner = note.kind === 'corner';
  const hasSide = !!note.side;
  const changed = !isEmptyEdit(edit);
  const words = noteText(shown, { dialect, units });

  const commitExtra = () => editNote(note.id, { extra: extra.trim() === (note.extra ?? '') ? undefined : extra.trim() });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Edit this call">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-bg p-3">
          <TurnArrow note={shown} size={64} word={false} />
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight">{edit?.hidden ? 'Skipped' : words}</div>
            <div className="text-sm text-mute">{edit?.hidden ? 'Navi will not call this one.' : `Navi says: “${words}”`}</div>
          </div>
        </div>

        {isCorner && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-mute">How tight is it?</h3>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Corner tightness">
              {LEVELS.map(([lv, name]) => {
                const on = shown.severity === lv;
                return (
                  <button
                    key={lv}
                    aria-pressed={on}
                    onClick={() => editNote(note.id, { severity: lv === note.severity ? undefined : lv })}
                    style={{ backgroundColor: SEV_COLOR[lv] }}
                    className={cn('min-h-12 rounded-xl px-2 text-sm font-semibold text-black transition active:scale-[0.98]', on ? 'ring-4 ring-ink' : 'opacity-80')}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {hasSide && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-mute">Which way?</h3>
            <Segmented
              label="Direction"
              value={shown.side ?? 'L'}
              onChange={(v) => editNote(note.id, { side: v === note.side ? undefined : v })}
              options={[{ value: 'L', label: 'Left' }, { value: 'R', label: 'Right' }]}
            />
          </section>
        )}

        {isCorner && (
          <section>
            {MODS.map(([k, label]) => (
              <Toggle
                key={k}
                label={label}
                checked={!!shown.mods[k]}
                onChange={(v) => editNote(note.id, { [k]: v === !!note.mods[k] ? undefined : v })}
              />
            ))}
          </section>
        )}

        <section className="space-y-2">
          <label htmlFor="note-extra" className="text-sm font-medium text-mute">Add your own words</label>
          <input
            id="note-extra"
            value={extra}
            maxLength={MAX_EXTRA}
            placeholder="for example: watch the gravel"
            onChange={(e) => setExtra(e.target.value)}
            onBlur={commitExtra}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
            className="min-h-12 w-full rounded-xl bg-bg px-3 text-[15px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-brand"
          />
        </section>

        <Toggle label="Skip this call" checked={!!edit?.hidden} onChange={(v) => editNote(note.id, { hidden: v ? true : undefined })} />

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!changed} onClick={() => resetNote(note.id)}>Put back the original</Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Sheet>
  );
}
