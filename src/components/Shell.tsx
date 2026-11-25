import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Compass, History as HistoryIcon, Settings as Cog, Star } from 'lucide-react';
import { useApp, type Tab } from '@/lib/store';
import { cn } from '@/lib/cn';
import { ExplorePanel } from './ExplorePanel';
import { HistoryTab } from './HistoryTab';
import { SavedTab } from './SavedTab';

const TABS: { id: Tab; label: string; Icon: typeof Compass }[] = [
  { id: 'explore', label: 'Explore', Icon: Compass },
  { id: 'saved', label: 'Saved', Icon: Star },
  { id: 'history', label: 'Recent', Icon: HistoryIcon },
];

/** Bottom sheet on phones, left panel on larger screens. */
export function Shell() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const stage = useApp((s) => s.stage);
  const to = useApp((s) => s.to);
  const [min, setMin] = useState(false);
  const startY = useRef<number | null>(null);

  // a new destination or route brings the panel back
  useEffect(() => setMin(false), [to, stage]);

  if (min) {
    const label = stage ? 'Show route' : 'Show panel';
    return (
      <button
        onClick={() => setMin(false)}
        aria-label={label}
        className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-10 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-panel px-5 text-sm font-medium text-ink shadow-[0_6px_28px_rgba(0,0,0,0.65)] ring-1 ring-line md:left-3 md:translate-x-0"
      >
        <ChevronUp size={20} /> {label}
      </button>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[74dvh] flex-col rounded-t-3xl bg-panel shadow-[0_-8px_40px_rgba(0,0,0,0.6)] md:inset-y-3 md:left-3 md:right-auto md:max-h-none md:w-[420px] md:rounded-3xl md:shadow-2xl">
      <button
        aria-label="Minimise to see the full map"
        onClick={() => setMin(true)}
        onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          if (startY.current !== null && e.changedTouches[0].clientY - startY.current > 40) setMin(true);
          startY.current = null;
        }}
        className="group mx-auto mt-1 flex h-9 w-full shrink-0 items-center justify-center text-mute"
      >
        <span className="h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <ChevronDown size={22} className="hidden md:block" aria-hidden />
      </button>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3">
        {tab === 'explore' && !stage && (
          <div className="mb-3 flex items-baseline justify-between px-1">
            <span className="font-display text-3xl font-bold italic tracking-tight">Navi<span className="text-brand">.</span></span>
            <span className="text-sm text-mute">Your rally co-driver</span>
          </div>
        )}
        {tab === 'explore' && <ExplorePanel />}
        {tab === 'saved' && <SavedTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
      <nav aria-label="Main" className="safe-b grid shrink-0 grid-cols-4 gap-1 border-t border-line px-2 pt-1">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs', tab === id ? 'text-brand-text' : 'text-mute hover:text-ink')}>
            <Icon size={22} />
            {label}
          </button>
        ))}
        <button onClick={() => setSettingsOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs text-mute hover:text-ink">
          <Cog size={22} />
          Settings
        </button>
      </nav>
    </div>
  );
}
