import { Compass, History as HistoryIcon, Settings as Cog, Star } from 'lucide-react';
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
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[74dvh] flex-col rounded-t-3xl bg-panel shadow-[0_-8px_40px_rgba(0,0,0,0.6)] md:inset-y-3 md:left-3 md:right-auto md:max-h-none md:w-[420px] md:rounded-3xl md:shadow-2xl">
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line md:hidden" aria-hidden />
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
          <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs', tab === id ? 'text-brand' : 'text-mute hover:text-ink')}>
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
