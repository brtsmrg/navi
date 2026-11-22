import { CornerUpLeft, CornerUpRight, Flag, Merge, Navigation, RotateCw } from 'lucide-react';
import { fullLabel, type Note } from '@/core';
import { cn } from '@/lib/cn';

/** A big arrow tile. Direction is in the shape (arrow), the colour (cyan left, amber right) and the word, never colour alone. */
export function TurnArrow({ note, size = 88, word = true }: { note: Note; size?: number; word?: boolean }) {
  const dir = note.side;
  const icon = size * 0.5;
  let Icon = Navigation;
  if (note.kind === 'finish') Icon = Flag;
  else if (note.kind === 'roundabout') Icon = RotateCw;
  else if (note.kind === 'merge') Icon = Merge;
  else if (dir === 'L') Icon = CornerUpLeft;
  else if (dir === 'R') Icon = CornerUpRight;
  const color = dir === 'L' ? 'bg-dirl' : dir === 'R' ? 'bg-dirr' : 'bg-raise text-ink';
  const label = dir === 'L' ? 'LEFT' : dir === 'R' ? 'RIGHT' : fullLabel(note).headline.split(',')[0].toUpperCase();
  return (
    <div
      aria-hidden
      style={{ width: size, height: size }}
      className={cn('flex shrink-0 flex-col items-center justify-center rounded-2xl text-bg', color)}
    >
      <Icon size={icon} strokeWidth={3} />
      {word && size >= 64 && <span className="mt-0.5 font-display text-sm font-bold leading-none tracking-wide">{label.slice(0, 9)}</span>}
    </div>
  );
}
